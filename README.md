# uspd-web

> Веб-конфигуратор УСПД для Linux **ARMv7**

[![Releases](https://img.shields.io/github/v/release/Omoegod/uspd-web-releases?label=release&style=flat-square)](https://github.com/Omoegod/uspd-web-releases/releases)
[![Platform](https://img.shields.io/badge/platform-linux%20armv7-blue?style=flat-square)](https://github.com/Omoegod/uspd-web-releases)
[![Go](https://img.shields.io/badge/go-1.26-00ADD8?style=flat-square&logo=go&logoColor=white)](https://go.dev)

Публичный репозиторий с готовыми сборками **uspd-web** — веб-интерфейса для настройки УСПД и RouterRF.

Исходный код распространяется отдельно. Здесь публикуются только собранные артефакты при выпуске новой версии (git-тег `v*`).

---

## Что внутри

| Артефакт | Описание |
|----------|----------|
| `uspd-web` | Исполняемый файл для Linux ARMv7 |
| `web/` | Статические файлы и HTML-шаблоны интерфейса |
| **Releases** | Архив `uspd-web-X.Y.Z.tar.gz` (бинарник + `web/`) |

---

## Требования

- Linux **ARMv7** (32-bit), например Orange Pi / УСПД
- Бинарник и папка `web/` должны лежать **в одной директории**

---

## Быстрый старт

### 1. Скачать релиз

```bash
VERSION=1.0.0
wget https://github.com/Omoegod/uspd-web-releases/releases/download/v${VERSION}/uspd-web-${VERSION}.tar.gz
```

### 2. Установить

```bash
mkdir -p /opt/uspd-web
tar -xzf uspd-web-${VERSION}.tar.gz -C /opt/uspd-web
cd /opt/uspd-web
chmod +x uspd-web
```

### 3. Запустить

```bash
./uspd-web
```

Веб-интерфейс будет доступен по адресу:

```
http://<IP-устройства>:8080
```

Сборка настроена для работы **на самом УСПД** — подключение к конфигуратору и RouterRF через `127.0.0.1`.

---

## Установка из репозитория

```bash
git clone https://github.com/Omoegod/uspd-web-releases.git /opt/uspd-web
cd /opt/uspd-web
chmod +x uspd-web
./uspd-web
```

---

## Переменные окружения

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `USPD_WEB_ADDR` | `:8080` | Адрес и порт веб-сервера |
| `USPD_DEVICE_ADDR` | `127.0.0.1:50005` | Адрес УСПД (протокол конфигуратора) |
| `USPD_RF_HOST` | `127.0.0.1` | Хост RouterRF |
| `USPD_RF_PORT` | `10001` | Порт RouterRF |
| `USPD_WEB_USER` | `admin` | Логин веб-интерфейса |
| `USPD_WEB_PASSWORD` | — | Пароль веб-интерфейса |

Пример запуска на порту 80:

```bash
USPD_WEB_ADDR=:80 ./uspd-web
```

---

## Автозапуск (systemd)

Создайте файл `/etc/systemd/system/uspd-web.service`:

```ini
[Unit]
Description=USPD Web Configurator
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/uspd-web
ExecStart=/opt/uspd-web/uspd-web
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Активация:

```bash
sudo systemctl daemon-reload
sudo systemctl enable uspd-web
sudo systemctl start uspd-web
sudo systemctl status uspd-web
```

---

## Обновление

```bash
cd /opt/uspd-web
sudo systemctl stop uspd-web

VERSION=1.1.0
wget -O /tmp/uspd-web.tar.gz \
  https://github.com/Omoegod/uspd-web-releases/releases/download/v${VERSION}/uspd-web-${VERSION}.tar.gz

tar -xzf /tmp/uspd-web.tar.gz -C /opt/uspd-web
sudo systemctl start uspd-web
```

---

## Структура архива

```
uspd-web-1.0.0.tar.gz
├── uspd-web          # бинарник
└── web/
    ├── static/       # CSS, JavaScript
    └── templates/    # HTML-шаблоны
```

---

## Версии

Актуальные релизы — в разделе [**Releases**](https://github.com/Omoegod/uspd-web-releases/releases).

| Тег | Архив |
|-----|-------|
| `v1.0.0` | `uspd-web-1.0.0.tar.gz` |
| `v1.1.0` | `uspd-web-1.1.0.tar.gz` |

---

## Лицензия

Проприетарное ПО. Все права защищены.
