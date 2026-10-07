"""Persistent editor accounts, private archives and capability preview links."""
import hashlib
from contextlib import contextmanager
import json
import os
import secrets
import shutil
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

from cryptography.fernet import Fernet
from flask import Response, g, jsonify, redirect, request, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash
from preview_feedback import install_feedback, feedback_page, feedback_document


def install_accounts(application, core, admin_login, admin_password):
    state = core.ARTICLES / '_accounts'
    state.mkdir(exist_ok=True)
    keyfile = state / 'key'
    try:
        with keyfile.open('xb') as stream:
            stream.write(Fernet.generate_key())
    except FileExistsError:
        pass
    cipher = Fernet(keyfile.read_bytes())
    application.secret_key = hashlib.sha256(keyfile.read_bytes()).digest()
    application.config.update(
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Lax',
        PERMANENT_SESSION_LIFETIME=timedelta(days=30),
        SESSION_REFRESH_EACH_REQUEST=True,
    )

    @contextmanager
    def db():
        connection = sqlite3.connect(state / 'users.sqlite3', timeout=30)
        connection.row_factory = sqlite3.Row
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def password_values(password):
        return generate_password_hash(password), cipher.encrypt(password.encode()).decode()

    with db() as connection:
        connection.executescript('''CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, login TEXT UNIQUE NOT NULL,
            hash TEXT NOT NULL, password TEXT NOT NULL, admin INTEGER NOT NULL DEFAULT 0,
            version INTEGER NOT NULL DEFAULT 1, role TEXT NOT NULL DEFAULT 'editor', email_access INTEGER DEFAULT NULL,
            last_seen TEXT DEFAULT NULL);
            CREATE TABLE IF NOT EXISTS previews (token TEXT PRIMARY KEY, owner TEXT NOT NULL,
            name TEXT NOT NULL, UNIQUE(owner,name));''')
        connection.execute('BEGIN IMMEDIATE')
        columns = {row['name'] for row in connection.execute('PRAGMA table_info(users)')}
        if 'role' not in columns:
            connection.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'editor'")
            connection.execute("UPDATE users SET role='admin' WHERE admin=1")
            connection.execute("UPDATE users SET role='moderator' WHERE id='ivan-nekrut' AND admin=0")
        if 'email_access' not in columns:
            connection.execute('ALTER TABLE users ADD COLUMN email_access INTEGER DEFAULT NULL')
        if 'last_seen' not in columns:
            connection.execute('ALTER TABLE users ADD COLUMN last_seen TEXT DEFAULT NULL')
        for uid, name, login, password, admin in [
            ('admin', 'Иван Радыгин', admin_login or 'admin', admin_password or secrets.token_urlsafe(18), 1),
            ('ivan-nekrut', 'Иван Некрут', 'ivan.nekrut', secrets.token_urlsafe(16), 0),
            ('editor-01', 'Редактор 01', 'editor01', secrets.token_urlsafe(16), 0),
            ('editor-02', 'Редактор 02', 'editor02', secrets.token_urlsafe(16), 0),
        ]:
            if not connection.execute('SELECT 1 FROM users WHERE id=?', (uid,)).fetchone():
                hashed, encrypted = password_values(password)
                connection.execute('INSERT INTO users(id,name,login,hash,password,admin,role) VALUES(?,?,?,?,?,?,?)', (uid,name,login,hashed,encrypted,admin,'admin' if admin else 'moderator' if uid=='ivan-nekrut' else 'editor'))
    # Bootstrap password is kept outside publicly served paths for local first login.
    if not admin_password:
        with db() as connection:
            row = connection.execute("SELECT * FROM users WHERE id='admin'").fetchone()
        (state / 'local-admin.txt').write_text(f"Логин: {row['login']}\nПароль: {cipher.decrypt(row['password'].encode()).decode()}\n", encoding='utf-8')

    def user_folder(uid):
        folder = core.ARTICLES / 'users' / uid
        folder.mkdir(parents=True, exist_ok=True)
        return folder

    def email_access(row):
        return bool(row['admin'] or (row['role']=='moderator' if row['email_access'] is None else row['email_access']))

    def public_user(row, passwords=False):
        item = {key: row[key] for key in ('id','name','login','admin','role')}
        item['emailAccess'] = email_access(row)
        last_seen = row['last_seen'] if 'last_seen' in row.keys() else None
        online = False
        if last_seen:
            try:
                seen_at = datetime.fromisoformat(last_seen.replace('Z', '+00:00'))
                if seen_at.tzinfo is None:
                    seen_at = seen_at.replace(tzinfo=timezone.utc)
                online = seen_at >= datetime.now(timezone.utc) - timedelta(seconds=90)
            except (TypeError, ValueError):
                pass
        item['online'] = online
        item['lastSeen'] = last_seen
        if passwords:
            item['password'] = cipher.decrypt(row['password'].encode()).decode()
        return item

    install_feedback(application, core, db, user_folder)

    def safe_write():
        origin = request.headers.get('Origin')
        return not origin or urlparse(origin).netloc == request.host

    @application.before_request
    def authentication():
        if request.path.startswith(('/preview/', '/api/public-preview/', '/api/public-email-images/')) or request.path == '/login':
            return None
        with db() as connection:
            row = connection.execute('SELECT * FROM users WHERE id=?', (session.get('uid',''),)).fetchone()
            if row and row['version'] != session.get('version'):
                row = None
            auth = request.authorization
            if not row and auth:
                candidate = connection.execute('SELECT * FROM users WHERE login=?', (auth.username or '',)).fetchone()
                if candidate and check_password_hash(candidate['hash'], auth.password or ''):
                    row = candidate
        if not row:
            if request.path.startswith('/api/'):
                return jsonify(error='Войдите в свой профиль', loginRequired=True), 401
            return redirect('/login')
        if request.method not in ('GET','HEAD','OPTIONS') and not safe_write():
            return jsonify(error='Недопустимый источник запроса'), 403
        g.editor_user = row
        email_path = (request.path in ('/email','/email/','/OUTMAX.html','/articles/email-editor.html')
            or request.path.startswith(('/email/','/api/email/','/api/email-projects','/api/email-review-queue',
                '/api/email-sender-profiles','/api/notisend/')))
        if email_path and not email_access(row):
            if request.path.startswith('/api/'):
                return jsonify(error='Доступ к email-редактору закрыт. Обратитесь к администратору.', emailAccessRequired=True), 403
            return Response('''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Доступ закрыт</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800&display=swap"><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#f5f6f8;font:14px/1.6 "Open Sans",Arial,sans-serif;color:#23272f}main{max-width:420px;margin:24px;padding:28px;background:#fff;border:1px solid #e5e7eb;border-radius:14px}h1{font-size:22px;margin:0 0 10px}p{color:#737b87;margin:0 0 22px}a{display:inline-block;padding:10px 14px;border-radius:7px;background:#23272f;color:#fff;text-decoration:none}</style></head><body><main><h1>Email-редактор недоступен</h1><p>Администратор может выдать доступ в настройках вашего пользователя.</p><a href="/">Вернуться к статьям</a></main></body></html>''',status=403,mimetype='text/html')
        g.storage_token = core.ARTICLE_STORAGE.set(user_folder(row['id']))

    @application.teardown_request
    def restore_storage(_error):
        if hasattr(g, 'storage_token'):
            core.ARTICLE_STORAGE.reset(g.storage_token)

    @application.after_request
    def privacy(response):
        if not request.path.startswith('/api/public-email-images/'):
            response.headers['Cache-Control'] = 'no-store'
        response.headers['Referrer-Policy'] = 'no-referrer' if request.path.startswith(('/preview/','/api/public-preview/','/api/public-email-images/')) else 'same-origin'
        return response

    login_page = '''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Вход · Редактор статей</title><link rel="preconnect" href="https://fonts.googleapis.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800&display=swap"><style>
*{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#22262d;font:14px/1.5 "Open Sans",Arial,sans-serif;min-height:100dvh;display:grid;place-items:center;padding:24px}.login-shell{width:100%;max-width:380px}.product-mark{display:flex;align-items:center;justify-content:center;gap:9px;margin-bottom:24px;font-size:11px;font-weight:600;letter-spacing:.07em;color:#747b87}.product-mark svg{width:22px;height:22px;color:#454b56}.login-card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:30px;box-shadow:0 8px 30px #1a253b06}h1{font-size:23px;line-height:1.3;letter-spacing:-.04em;margin:0 0 7px;font-weight:600}.intro{font-size:12px;line-height:1.6;color:#858c97;margin:0 0 25px}label{display:grid;gap:7px;font-size:11px;color:#606875;margin-bottom:17px}input{width:100%;padding:11px 12px;min-height:42px;border:1px solid #dfe3e9;border-radius:7px;background:#fff;color:#22262d;font:14px "Open Sans",Arial,sans-serif}input:focus-visible{outline:2px solid #858b94;outline-offset:2px}button{width:100%;padding:12px;min-height:42px;border:1px solid #1d2026;border-radius:7px;background:#1d2026;color:#fff;font:500 12px "Open Sans",Arial,sans-serif;cursor:pointer;margin-top:4px;transition:transform 140ms cubic-bezier(.23,1,.32,1),background-color 160ms ease}button:focus-visible{outline:2px solid #858b94;outline-offset:3px}.error{color:#b8323a;background:#fff3f3;font-size:11px;line-height:1.6;padding:10px 12px;border-radius:6px;margin:0 0 15px}.login-help{text-align:center;font-size:10px;color:#9096a1;line-height:1.7;margin:18px 0 0}@media(hover:hover) and (pointer:fine){button:hover{background:#333741}}button:active{transform:scale(.97)}@media(prefers-reduced-motion:reduce){button{transition:none;transform:none}}@media(max-width:480px){body{padding:20px}.login-card{padding:26px}input{font-size:16px}}
</style></head><body><main class="login-shell"><div class="product-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 3h16v18H4ZM8 7h8M8 11h8M8 15h5"/></svg>OUTMAX / ХАСЛ</div><form class="login-card" method="post"><h1>Добро пожаловать</h1><p class="intro">Войдите в своё рабочее пространство<br>редактора статей.</p>ERROR<label>Логин<input name="login" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="Ваш логин"></label><label>Пароль<input name="password" type="password" autocomplete="current-password" required placeholder="Ваш пароль"></label><button type="submit">Войти в редактор</button></form><p class="login-help">Нет доступа? Обратитесь к администратору.</p></main></body></html>'''


    @application.route('/login', methods=['GET','POST'])
    def login():
        error = ''
        if request.method == 'POST':
            if not safe_write():
                return 'Недопустимый источник запроса', 403
            with db() as connection:
                row = connection.execute('SELECT * FROM users WHERE login=?', (request.form.get('login',''),)).fetchone()
            if row and check_password_hash(row['hash'], request.form.get('password','')):
                session.clear()
                session.update(uid=row['id'], version=row['version'])
                session.permanent = True
                with db() as connection:
                    connection.execute('UPDATE users SET last_seen=? WHERE id=?', (datetime.now(timezone.utc).isoformat(), row['id']))
                target=request.args.get('next','/')
                parsed=urlparse(target)
                if parsed.scheme or parsed.netloc or '\\' in target or not parsed.path.startswith(('/preview/','/editor-api/public-preview/','/api/public-preview/')):
                    target='/'
                return redirect(target)
            error = '<p class="error" role="alert">Неверный логин или пароль. Проверьте данные и попробуйте ещё раз.</p>'
        return Response(login_page.replace('ERROR', error), mimetype='text/html')

    @application.post('/api/logout')
    def logout():
        uid = session.get('uid')
        if uid:
            with db() as connection:
                connection.execute('UPDATE users SET last_seen=NULL WHERE id=?', (uid,))
        session.clear()
        return jsonify(ok=True)

    @application.post('/api/presence')
    def presence():
        """Keep a short-lived, cross-worker marker while an editor tab is open."""
        seen_at = datetime.now(timezone.utc).isoformat()
        with db() as connection:
            connection.execute('UPDATE users SET last_seen=? WHERE id=?', (seen_at, g.editor_user['id']))
        return jsonify(ok=True, lastSeen=seen_at)

    @application.get('/api/me')
    def me():
        return jsonify(public_user(g.editor_user))

    @application.get('/api/users')
    def users():
        if not g.editor_user['admin']:
            return jsonify(error='Доступ только администратору'), 403
        with db() as connection:
            return jsonify([public_user(row, True) for row in connection.execute('SELECT * FROM users ORDER BY admin DESC,name')])

    @application.get('/api/users/presence')
    def users_presence():
        if not g.editor_user['admin']:
            return jsonify(error='Доступ только администратору'), 403
        with db() as connection:
            items=[]
            for row in connection.execute('SELECT * FROM users ORDER BY admin DESC,name'):
                user=public_user(row)
                items.append({key:user[key] for key in ('id','online','lastSeen')})
            return jsonify(items)

    @application.post('/api/users/password')
    def generate_password():
        if not g.editor_user['admin']:
            return jsonify(error='Доступ только администратору'), 403
        return jsonify(password=secrets.token_urlsafe(16))

    @application.post('/api/users')
    def create_user():
        if not g.editor_user['admin']:
            return jsonify(error='Доступ только администратору'), 403
        payload = request.get_json() or {}
        name, login = (str(payload.get(key,'')).strip() for key in ('name','login'))
        password = str(payload.get('password') or secrets.token_urlsafe(16))
        role = payload.get('role','editor')
        if not name or not login or len(name)>100 or len(login)>100 or not 8<=len(password)<=200 or role not in ('editor','moderator'):
            return jsonify(error='Укажите имя, уникальный логин, роль и пароль от 8 символов'), 400
        access = payload.get('emailAccess')
        if access is not None and not isinstance(access,bool):
            return jsonify(error='Неверное право доступа к email'),400
        uid = 'user-' + secrets.token_hex(12)
        hashed, encrypted = password_values(password)
        try:
            with db() as connection:
                connection.execute('INSERT INTO users(id,name,login,hash,password,role,email_access) VALUES(?,?,?,?,?,?,?)',(uid,name,login,hashed,encrypted,role,access))
                row = connection.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
        except sqlite3.IntegrityError:
            return jsonify(error='Такой логин уже занят'), 409
        user_folder(uid)
        return jsonify(public_user(row, True)), 201

    @application.patch('/api/users/<uid>')
    def update_user(uid):
        if not g.editor_user['admin']:
            return jsonify(error='Доступ только администратору'), 403
        payload = request.get_json() or {}
        name, login = (str(payload.get(key,'')).strip() for key in ('name','login'))
        if not name or not login or len(name)>100 or len(login)>100:
            return jsonify(error='Укажите имя и логин длиной до 100 символов'), 400
        try:
            with db() as connection:
                previous = connection.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
                if not previous:
                    return jsonify(error='Пользователь не найден'), 404
                role = 'admin' if previous['admin'] else payload.get('role',previous['role'])
                if role not in (('admin',) if previous['admin'] else ('editor','moderator')):
                    return jsonify(error='Неизвестная роль'), 400
                access = previous['email_access']
                if 'emailAccess' in payload:
                    if not isinstance(payload['emailAccess'],bool):
                        return jsonify(error='Неверное право доступа к email'),400
                    access = int(payload['emailAccess'])
                if previous['admin']:
                    access = 1
                password = payload.get('password')
                hashed, encrypted = previous['hash'], previous['password']
                if password:
                    if not isinstance(password,str) or not 8<=len(password)<=200:
                        return jsonify(error='Пароль должен содержать от 8 до 200 символов'), 400
                    if not check_password_hash(previous['hash'],password):
                        hashed, encrypted = password_values(password)
                changed_access = login!=previous['login'] or role!=previous['role'] or bool(password and not check_password_hash(previous['hash'],password))
                version = previous['version'] + int(changed_access)
                connection.execute('UPDATE users SET name=?,login=?,hash=?,password=?,role=?,email_access=?,version=? WHERE id=?',(name,login,hashed,encrypted,role,access,version,uid))
                if uid == g.editor_user['id']:
                    session.update(uid=uid,version=version)
        except sqlite3.IntegrityError:
            return jsonify(error='Такой логин уже занят'), 409
        return jsonify(ok=True)

    def record_list(folder):
        items = []
        for file in folder.glob('*.json'):
            try:
                record = json.loads(file.read_text(encoding='utf-8'))
                if file.stem == 'email-editor':
                    continue
                brand = record.get('brand') or ('hasl' if file.stem.startswith('hasl--') else 'outmax')
                soup = core.BeautifulSoup(record.get('body',''), 'html.parser')
                image = soup.find('img', src=True)
                items.append(dict(id=core.public_draft_id(file.stem,brand),brand=brand,title=record.get('title',file.stem),
                    createdAt=record.get('createdAt') or record.get('savedAt') or datetime.fromtimestamp(file.stat().st_mtime).astimezone().isoformat(),
                    savedAt=record.get('savedAt',''),preview=soup.get_text(' ',strip=True)[:220],image=image['src'] if image else ''))
            except (ValueError,OSError,TypeError):
                continue
        return sorted(items, key=lambda item:item['createdAt'], reverse=True)

    @application.get('/api/archive')
    def archive():
        return jsonify(record_list(core.article_storage()))

    def can_inspect():
        return bool(g.editor_user['admin'] or g.editor_user['role']=='moderator')

    def archive_owner(uid):
        if uid != g.editor_user['id'] and not can_inspect():
            return None, (jsonify(error='Нет доступа к архиву этого пользователя'),403)
        with db() as connection:
            row = connection.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
        if not row:
            return None, (jsonify(error='Пользователь не найден'),404)
        return user_folder(row['id']), None

    @application.get('/api/archive-users')
    def archive_users():
        if not can_inspect():
            return jsonify(error='Доступ только модератору и администратору'),403
        with db() as connection:
            rows = connection.execute('SELECT * FROM users ORDER BY admin DESC,name').fetchall()
        result = []
        for row in rows:
            item = public_user(row)
            item['articleCount'] = sum(1 for file in user_folder(row['id']).glob('*.json') if file.stem!='email-editor')
            result.append(item)
        return jsonify(result)

    @application.get('/api/archive/<uid>')
    def user_archive(uid):
        folder, error = archive_owner(uid)
        if error:
            return error
        return jsonify(record_list(folder))

    @application.get('/api/archive/<uid>/assets/<path:asset>')
    def archive_asset(uid,asset):
        folder, error = archive_owner(uid)
        if error:
            return error
        if '_files/' not in asset or Path(asset).suffix.lower() not in ('.jpg','.jpeg','.png','.webp','.gif'):
            return jsonify(error='Изображение не найдено'),404
        response = send_from_directory(folder,asset)
        response.headers['Content-Security-Policy'] = "default-src 'none'; sandbox"
        return response

    @application.get('/api/archive/<uid>/article/<name>')
    def inspect_article(uid,name):
        folder, error = archive_owner(uid)
        if error:
            return error
        brand = request.args.get('brand','outmax')
        stored = core.paths(core.storage_name(name,brand))[0]
        file = folder / f'{stored}.json'
        if not file.is_file():
            return jsonify(error='Статья не найдена'),404
        record = json.loads(file.read_text(encoding='utf-8'))
        soup = core.BeautifulSoup(record.get('body',''),'html.parser')
        for image in soup.select('img[src]'):
            src = image['src']
            if src.startswith('/articles/') or src.startswith('articles/'):
                src = src.split('articles/',1)[1]
            if not src.startswith(('https:','http:','data:','blob:','/')):
                image['src'] = '/editor-api/archive/' + uid + '/assets/' + core.quote(src,safe='/')
        response = Response(core.admin_document(record.get('title','Статья'),str(soup),brand),mimetype='text/html')
        response.headers['Content-Security-Policy'] = "sandbox allow-same-origin; default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https: data:; base-uri 'none'; form-action 'none'"
        return response

    def copy_article(folder,name,brand,source_owner=None):
        stored = core.paths(core.storage_name(name,brand))[0]
        source = folder / f'{stored}.json'
        if not source.is_file():
            return jsonify(error='Статья не найдена'),404
        record = json.loads(source.read_text(encoding='utf-8'))
        public = core.slug(name)[:40] + '-copy-' + secrets.token_hex(5)
        new = core.paths(core.storage_name(public,brand))[0]
        assets = folder / f'{stored}_files'
        if assets.exists():
            shutil.copytree(assets,core.article_storage()/f'{new}_files')
        # Imported articles can reuse a photo from another draft of the same owner.
        # Copy every such referenced image into the new article's own material folder.
        replacements = {}
        soup = core.BeautifulSoup(record.get('body',''),'html.parser')
        material_sources = {image['src'] for image in soup.select('img[src]')}
        for product in record.get('products',[]):
            material_sources.update(src for src in product.get('images',[]) if isinstance(src,str))
        for src in material_sources:
            relative = src.removeprefix('/articles/').removeprefix('articles/')
            if relative.startswith(('http:','https:','data:','blob:','/')) or not ('_files/' in relative or relative.startswith('_article_history/')):
                continue
            candidate = (folder/relative).resolve()
            if not candidate.is_relative_to(folder.resolve()) or not candidate.is_file() or candidate.suffix.lower() not in ('.png','.jpg','.jpeg','.webp','.gif'):
                continue
            if relative.startswith(f'{stored}_files/'):
                replacement = f'{new}_files/' + relative[len(f'{stored}_files/'):]
            else:
                destination = core.article_storage()/f'{new}_files'
                destination.mkdir(exist_ok=True)
                filename = 'copied-' + hashlib.sha256(relative.encode()).hexdigest()[:16] + candidate.suffix.lower()
                shutil.copy2(candidate,destination/filename)
                replacement = f'{new}_files/{filename}'
            replacements[src] = replacement
        for image in soup.select('img[src]'):
            image['src'] = replacements.get(image['src'],image['src'])
        record['body'] = str(soup)

        def remap_material(value):
            if isinstance(value,dict):
                return {key:remap_material(item) for key,item in value.items()}
            if isinstance(value,list):
                return [remap_material(item) for item in value]
            if isinstance(value,str):
                if value in replacements:
                    return replacements[value]
                relative = value.removeprefix('/articles/').removeprefix('articles/')
                if relative.startswith(f'{stored}_files/'):
                    return f'{new}_files/' + relative[len(f'{stored}_files/'):]
            return value
        record = remap_material(record)
        now = datetime.now().astimezone().isoformat(timespec='seconds')
        record.update(id=public,brand=brand,createdAt=now,savedAt=now)
        for key in ('documentId','revision','_saveRequest','_saveFingerprint','previousRevision','restoredFrom','savedBy','saveKind'):
            record.pop(key,None)
        if source_owner:
            record['copiedFrom'] = dict(owner=source_owner,id=core.slug(name),brand=brand)
        target = core.article_storage()/f'{new}.json'
        target.write_text(json.dumps(record,ensure_ascii=False),encoding='utf-8')
        return jsonify(id=public,brand=brand)

    @application.post('/api/archive/<uid>/article/<name>/copy')
    def copy_user_article(uid,name):
        folder, error = archive_owner(uid)
        if error:
            return error
        return copy_article(folder,name,request.args.get('brand','outmax'),uid)

    @application.get('/api/legacy-drafts')
    def legacy_drafts():
        return jsonify(record_list(core.ARTICLES))

    @application.post('/api/legacy-drafts/<name>/copy')
    def copy_legacy(name):
        return copy_article(core.ARTICLES,name,request.args.get('brand','outmax'))

    @application.delete('/api/draft/<name>')
    def delete_draft(name):
        stored = core.paths(core.storage_name(name, request.args.get('brand','outmax')))[0]
        _, draft, html, folder = core.paths(stored)
        if not draft.exists():
            return jsonify(error='Статья не найдена'),404
        draft.unlink()
        html.unlink(missing_ok=True)
        if folder.exists():
            shutil.rmtree(folder)
        application.extensions['feedback_cleanup'](g.editor_user['id'],stored)
        return jsonify(ok=True)

    def email_project_file(uid,name):
        project_id = core.slug(name or 'rassylka')
        return project_id, user_folder(uid)/'_email_projects'/f'{project_id}.json'

    def ensure_email_preview(owner,project_id):
        preview_name = 'email::' + project_id
        with db() as connection:
            connection.execute('INSERT OR IGNORE INTO previews(token,owner,name) VALUES(?,?,?)',
                               (secrets.token_urlsafe(32),owner,preview_name))
            row = connection.execute('SELECT token FROM previews WHERE owner=? AND name=?',
                                     (owner,preview_name)).fetchone()
        return row['token']

    @application.post('/api/email-projects/<name>/preview')
    def create_email_preview(name):
        project_id, file = email_project_file(g.editor_user['id'],name)
        if not file.is_file():
            return jsonify(error='Сначала сохраните email-проект'),404
        record = json.loads(file.read_text(encoding='utf-8'))
        if not record.get('renderedHtml'):
            return jsonify(error='Сначала сохраните актуальную версию письма'),400
        token = ensure_email_preview(g.editor_user['id'],project_id)
        return jsonify(url=f'/preview/{token}/')

    @application.delete('/api/email-projects/<name>/preview')
    def revoke_email_preview(name):
        project_id,_ = email_project_file(g.editor_user['id'],name)
        with db() as connection:
            connection.execute('DELETE FROM previews WHERE owner=? AND name=?',
                               (g.editor_user['id'],'email::'+project_id))
        return jsonify(ok=True)

    @application.post('/api/email-projects/<name>/workflow')
    def email_project_workflow(name):
        project_id,file = email_project_file(g.editor_user['id'],name)
        if not file.is_file():
            return jsonify(error='Email-проект не найден'),404
        payload = request.get_json(silent=True) or {}
        action = str(payload.get('action') or '')
        record = json.loads(file.read_text(encoding='utf-8'))
        now = datetime.now().astimezone().isoformat(timespec='seconds')
        if action == 'submit':
            record['workflowStatus'] = 'review'
            record['submittedAt'] = now
            record['reviewComment'] = ''
            token = ensure_email_preview(g.editor_user['id'],project_id)
        elif action == 'withdraw':
            record['workflowStatus'] = 'draft'
            token = None
        elif action == 'notisend':
            if not record.get('notisendCampaignId'):
                return jsonify(error='Campaign NotiSend ещё не создан'),400
            record['workflowStatus'] = 'notisend'
            token = ensure_email_preview(g.editor_user['id'],project_id)
        else:
            return jsonify(error='Неизвестное действие согласования'),400
        record['savedAt'] = now
        file.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
        return jsonify(status=record['workflowStatus'],previewUrl=f'/preview/{token}/' if token else None)

    @application.get('/api/email-review-queue')
    def email_review_queue():
        if not can_inspect():
            return jsonify(error='Доступ только модератору и администратору'),403
        with db() as connection:
            users = connection.execute('SELECT * FROM users ORDER BY name').fetchall()
            previews = {(row['owner'],row['name']):row['token'] for row in connection.execute('SELECT * FROM previews').fetchall()}
        items = []
        for user in users:
            folder = user_folder(user['id'])/'_email_projects'
            if not folder.exists():
                continue
            for file in folder.glob('*.json'):
                try:
                    record = json.loads(file.read_text(encoding='utf-8'))
                except (OSError,ValueError):
                    continue
                status = record.get('workflowStatus') or 'draft'
                if status == 'draft':
                    continue
                token = previews.get((user['id'],'email::'+file.stem))
                items.append(dict(
                    ownerId=user['id'],ownerName=user['name'],id=file.stem,
                    subject=record.get('subject') or 'Без темы',status=status,
                    savedAt=record.get('savedAt'),submittedAt=record.get('submittedAt'),
                    reviewComment=record.get('reviewComment') or '',
                    reviewerName=record.get('reviewerName') or '',
                    campaignId=record.get('notisendCampaignId'),
                    previewUrl=f'/preview/{token}/' if token else None,
                ))
        items.sort(key=lambda item:item.get('submittedAt') or item.get('savedAt') or '',reverse=True)
        return jsonify(items=items)

    @application.post('/api/email-review-queue/<uid>/<name>/workflow')
    def review_email_project(uid,name):
        if not can_inspect():
            return jsonify(error='Доступ только модератору и администратору'),403
        project_id,file = email_project_file(uid,name)
        if not file.is_file():
            return jsonify(error='Email-проект не найден'),404
        payload = request.get_json(silent=True) or {}
        action = str(payload.get('action') or '')
        if action not in ('approve','changes'):
            return jsonify(error='Неизвестное действие согласования'),400
        record = json.loads(file.read_text(encoding='utf-8'))
        record['workflowStatus'] = 'approved' if action == 'approve' else 'changes'
        record['reviewComment'] = str(payload.get('comment') or '')[:2000]
        record['reviewerId'] = g.editor_user['id']
        record['reviewerName'] = g.editor_user['name']
        record['reviewUpdatedAt'] = datetime.now().astimezone().isoformat(timespec='seconds')
        record['savedAt'] = record['reviewUpdatedAt']
        file.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
        token = ensure_email_preview(uid,project_id)
        return jsonify(status=record['workflowStatus'],previewUrl=f'/preview/{token}/')

    @application.post('/api/preview/<name>')
    def create_preview(name):
        stored = core.paths(core.storage_name(name,request.args.get('brand','outmax')))[0]
        if not core.paths(stored)[1].exists():
            return jsonify(error='Сначала сохраните статью'),404
        with db() as connection:
            connection.execute('INSERT OR IGNORE INTO previews(token,owner,name) VALUES(?,?,?)',(secrets.token_urlsafe(32),g.editor_user['id'],stored))
            row = connection.execute('SELECT token FROM previews WHERE owner=? AND name=?',(g.editor_user['id'],stored)).fetchone()
        return jsonify(url=f'/editor-api/public-preview/{row["token"]}/')

    @application.get('/api/public-preview/<token>/')
    @application.get('/api/public-preview/<token>/<path:asset>')
    @application.get('/preview/<token>/')
    @application.get('/preview/<token>/<path:asset>')
    def public_preview(token,asset=''):
        with db() as connection:
            row = connection.execute('SELECT * FROM previews WHERE token=?',(token,)).fetchone()
        if not row:
            return 'Предпросмотр не найден',404
        folder = user_folder(row['owner'])
        if str(row['name']).startswith('email::'):
            project_id = str(row['name']).split('email::',1)[1]
            project_folder = folder/'_email_projects'
            file = project_folder/f'{project_id}.json'
            if not file.exists():
                return 'Предпросмотр не найден',404
            record = json.loads(file.read_text(encoding='utf-8'))
            if asset:
                if not asset.startswith('email-assets/'):
                    return 'Не найдено',404
                filename = Path(asset.split('/',1)[1]).name
                if filename not in set((record.get('assets') or {}).values()):
                    return 'Не найдено',404
                response = send_from_directory(project_folder/f'{project_id}_files',filename)
                response.headers['Content-Security-Policy'] = "default-src 'none'; sandbox"
                return response
            if request.args.get('content') == '1':
                document = str(record.get('renderedHtml') or '')
                asset_base = f'/preview/{token}/email-assets/'
                document = document.replace('__EMAIL_PROJECT_ASSET__/',asset_base)
                document = document.replace('href="[%unsubscribe_link%]"','href="#"')
                document = document.replace("href='[%unsubscribe_link%]'","href='#'")
                return feedback_document(document)
            title = core.escape(str(record.get('subject') or 'Email-рассылка'))
            status_key = str(record.get('workflowStatus') or 'draft')
            status = core.escape({'draft':'Черновик','review':'На проверке','approved':'Одобрено','changes':'Нужны правки','notisend':'В NotiSend'}.get(status_key,status_key))
            return feedback_page(str(record.get('subject') or 'Email-рассылка'), 'Предпросмотр email · '+status)
        file = folder/f'{row["name"]}.json'
        if not file.exists():
            return 'Предпросмотр не найден',404
        if asset:
            if not asset.startswith(row['name']+'_files/'):
                return 'Не найдено',404
            response = send_from_directory(folder,asset)
            response.headers['Content-Security-Policy'] = "default-src 'none'; sandbox"
            return response
        record = json.loads(file.read_text(encoding='utf-8'))
        body = record.get('body','').replace('/articles/','').replace('articles/','')
        if request.args.get('content') == '1':
            document = core.admin_document(record.get('title','Статья'),body,record.get('brand','outmax'))
            return feedback_document(document)
        return feedback_page(str(record.get('title') or 'Статья'), 'Предпросмотр статьи')
