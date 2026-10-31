"""Server-only LPmotor credentials and an explicit read-only API check."""
import argparse
import json
import re
from pathlib import Path

import requests
from cryptography.fernet import Fernet, InvalidToken
from article_storage import atomic_write

API_URL = 'https://api.lpmotor.ru/v3/public/site'


class LPmotorError(ValueError):
    pass


def load_config(state):
    folder = Path(state) / '_accounts'
    path = folder / 'lpmotor.enc'
    if not path.exists():
        return {'login': '', 'password': '', 'apiKey': '', 'userId': ''}
    try:
        config = json.loads(Fernet((folder / 'key').read_bytes()).decrypt(path.read_bytes()))
        if (not isinstance(config, dict) or set(config) != {'login', 'password', 'apiKey', 'userId'}
                or any(not isinstance(value, str) for value in config.values())):
            raise ValueError()
        return config
    except (OSError, ValueError, InvalidToken):
        raise LPmotorError('Не удалось прочитать настройки LPmotor. Проверьте серверный ключ _accounts/key.') from None


def save_config(state, data):
    previous = load_config(state)
    values = {key: data.get(key, previous[key]) for key in previous}
    if any(not isinstance(value, str) for value in values.values()):
        raise LPmotorError('Настройки LPmotor должны быть строками.')
    values = {key: value.strip() if key != 'password' else value for key, value in values.items()}
    if (not 8 <= len(values['apiKey']) <= 2048 or not values['apiKey'].isascii()
            or any(ord(char) < 33 or ord(char) > 126 for char in values['apiKey'])
            or len(values['login']) > 320 or len(values['password']) > 1024
            or any(char in values['login'] + values['password'] for char in '\r\n')
            or (values['userId'] and not re.fullmatch(r'[1-9][0-9]{0,19}', values['userId']))):
        raise LPmotorError('Проверьте API-ключ и числовой ID пользователя LPmotor.')
    folder = Path(state) / '_accounts'
    folder.mkdir(parents=True, exist_ok=True)
    key = folder / 'key'
    try:
        with key.open('xb') as stream:
            stream.write(Fernet.generate_key())
    except FileExistsError:
        pass
    atomic_write(folder / 'lpmotor.enc', Fernet(key.read_bytes()).encrypt(json.dumps(values).encode()))
    return status(values)


def status(config):
    return {'configured': bool(config['apiKey'] and config['userId']),
            'credentialsStored': bool(config['apiKey']),
            'cabinetCredentialsStored': bool(config['login'] and config['password']),
            'needsUserId': bool(config['apiKey'] and not config['userId'])}


def check_connection(state):
    config = load_config(state)
    if not status(config)['configured']:
        raise LPmotorError('Укажите API-ключ и числовой ID пользователя LPmotor. Логин и пароль не заменяют ID.')
    try:
        response = requests.get(API_URL, params={'limit': 1, 'offset': 0}, headers={
            'Authorization': 'Bearer ' + config['apiKey'], 'X-Api-User-Id': config['userId'],
            'Accept': 'application/json', 'Content-Type': 'application/json',
        }, timeout=20, allow_redirects=False)
    except requests.RequestException:
        raise LPmotorError('LPmotor недоступен или не ответил вовремя. Повторите проверку позже.') from None
    if response.status_code in (401, 403):
        raise LPmotorError('LPmotor отклонил доступ. Проверьте API-ключ, ID пользователя и права ключа.')
    if response.status_code != 200:
        raise LPmotorError('LPmotor вернул ошибку. Повторите проверку позже.')
    try:
        payload = response.json()
        if (not isinstance(payload, dict) or not isinstance(payload.get('sites'), list)
                or type(payload.get('count')) is not int or payload['count'] < 0):
            raise ValueError()
    except ValueError:
        raise LPmotorError('LPmotor вернул неожиданный формат ответа.') from None
    return {'ok': True, 'siteCount': payload['count']}


def install_lpmotor(application, core):
    from flask import g, jsonify, request

    @application.route('/api/lpmotor/<action>', methods=['GET', 'POST'])
    def lpmotor(action):
        if g.editor_user['role'] != 'admin':
            return jsonify(error='Настройки LPmotor доступны только администратору.'), 403
        try:
            if action == 'status' and request.method == 'GET':
                return jsonify(status(load_config(core.ARTICLES)))
            if action == 'check' and request.method == 'POST':
                return jsonify(check_connection(core.ARTICLES))
            if action == 'configure' and request.method == 'POST':
                if request.content_length is None or request.content_length > 8192:
                    return jsonify(error='Некорректный размер настроек.'), 400
                data = request.get_json(silent=True)
                if not isinstance(data, dict) or set(data) - {'login', 'password', 'apiKey', 'userId'}:
                    return jsonify(error='Некорректные настройки LPmotor.'), 400
                return jsonify(save_config(core.ARTICLES, data))
            return jsonify(error='Не найдено'), 404
        except LPmotorError as exc:
            return jsonify(error=str(exc)), 502 if action == 'check' else 400


def main():
    parser = argparse.ArgumentParser(description='Импорт серверных настроек LPmotor без вывода секретов.')
    parser.add_argument('--import-file', type=Path)
    parser.add_argument('--user-id')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    state = Path(__file__).resolve().parent / 'articles'
    try:
        data = {}
        if args.import_file:
            text = args.import_file.read_text(encoding='utf-8-sig')
            labels = {'login': 'login', 'password': 'password', 'api': 'apiKey', 'id': 'userId'}
            for label, value in re.findall(r'(?im)^([a-z]+)\s*:\s*([^\r\n]+)', text):
                if label.lower() in labels:
                    data[labels[label.lower()]] = value.strip()
            if not all(data.get(key) for key in ('login', 'password', 'apiKey')):
                raise LPmotorError('Файл должен содержать строки Login:, Password: и API:.')
        if args.user_id is not None:
            data['userId'] = args.user_id
        if data:
            result = save_config(state, data)
        else:
            result = status(load_config(state))
        if args.check:
            result = check_connection(state)
        print(json.dumps(result, ensure_ascii=False))
    except (LPmotorError, OSError, UnicodeError) as exc:
        print(str(exc) if isinstance(exc, LPmotorError) else 'Не удалось прочитать или сохранить файл настроек LPmotor.')
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
