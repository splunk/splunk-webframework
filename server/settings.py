# Django settings for testsite project.

import os
import sys
import json

current_dir = os.path.dirname(__file__)

# Add the contrib packages to our pythonpath
contrib_dir = os.path.join(current_dir, '..', 'contrib')
for contrib_package_path in os.listdir(contrib_dir):
    contrib_package_path = os.path.join(contrib_dir, contrib_package_path)
    contrib_package_path = os.path.abspath(contrib_package_path)
    sys.path.insert(0, contrib_package_path)

# Add the apps to the path
apps_path = os.path.join(current_dir, 'apps')
sys.path.insert(0, apps_path)

# Get the config file
APPFX_CONFIG = {}
if 'APPFX_CONFIG' in os.environ and os.environ['APPFX_CONFIG'].strip():
    APPFX_CONFIG = json.load(open(os.environ['APPFX_CONFIG'], 'r'))

# Pickup the debug flag from the config file
DEBUG = APPFX_CONFIG.get("debug")
TEMPLATE_DEBUG = DEBUG

# Find out whether we are in test mode (best way to do this according
# to internet)
TEST_MODE = "test" in sys.argv or os.environ.has_key("TEST_MODE")

ADMINS = (
    # ('Your Name', 'your_email@example.com'),
)

MANAGERS = ADMINS

DATABASES = {
    'default': {}
}

# Local time zone for this installation. Choices can be found here:
# http://en.wikipedia.org/wiki/List_of_tz_zones_by_name
# although not all choices may be available on all operating systems.
# On Unix systems, a value of None will cause Django to use the same
# timezone as the operating system.
# If running in a Windows environment this must be set to the same as your
# system time zone.
TIME_ZONE = 'America/Los_Angeles'

# Language code for this installation. All choices can be found here:
# http://www.i18nguy.com/unicode/language-identifiers.html
LANGUAGE_CODE = 'en-us'

SITE_ID = 1

# If you set this to False, Django will make some optimizations so as not
# to load the internationalization machinery.
USE_I18N = True

# If you set this to False, Django will not format dates, numbers and
# calendars according to the current locale.
USE_L10N = True

# If you set this to False, Django will not use timezone-aware datetimes.
USE_TZ = True

# Absolute filesystem path to the directory that will hold user-uploaded files.
# Example: "/home/media/media.lawrence.com/media/"
MEDIA_ROOT = ''

# URL that handles the media served from MEDIA_ROOT. Make sure to use a
# trailing slash.
# Examples: "http://media.lawrence.com/media/", "http://example.com/media/"
MEDIA_URL = ''

# We will error out if there is no 'mount' set.
if not 'mount' in APPFX_CONFIG:
    raise Exception("You must have a 'mount' value defined in .appfxrc")
    
MOUNT = APPFX_CONFIG.get('mount')

# Absolute path to the directory static files should be collected to.
# Don't put anything in this directory yourself; store your static files
# in apps' "static/" subdirectories and in STATICFILES_DIRS.
# Example: "/home/media/media.lawrence.com/static/"
STATIC_ROOT = os.path.join(current_dir, 'static')

# URL prefix for static files.
# Example: "http://media.lawrence.com/static/"
STATIC_URL = '/%s/static/' % MOUNT

# Additional locations of static files
STATICFILES_DIRS = (
    # Put strings here, like "/home/html/static" or "C:/www/django/static".
    # Always use forward slashes, even on Windows.
    # Don't forget to use absolute paths, not relative paths.
)

SESSION_ENGINE='django.contrib.sessions.backends.signed_cookies'

# List of finder classes that know how to find static files in
# various locations.
STATICFILES_FINDERS = (
    'django.contrib.staticfiles.finders.FileSystemFinder',
    'django.contrib.staticfiles.finders.AppDirectoriesFinder',
    'appfx.loaders.statics.StaticRootFinder',
#    'django.contrib.staticfiles.finders.DefaultStorageFinder',
)

# Make this unique, and don't share it with anybody.
SECRET_KEY = APPFX_CONFIG.get('secret_key')

# List of callables that know how to import templates from various sources.
TEMPLATE_LOADERS = (
    'appfx.loaders.template_loader.SpecificAppLoader',
    'django.template.loaders.filesystem.Loader',
    'django.template.loaders.app_directories.Loader',
#     'django.template.loaders.eggs.Loader',
)

MIDDLEWARE_CLASSES = (
    'django.middleware.common.CommonMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'appfx.auth.middleware.SplunkAuthenticationMiddleware',
    'appfx.middlewares.SplunkCsrfMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'debug_toolbar.middleware.DebugToolbarMiddleware',
    # Uncomment the next line for simple clickjacking protection:
    # 'django.middleware.clickjacking.XFrameOptionsMiddleware',
)

INTERNAL_IPS = ('127.0.0.1', 'localhost')

TEMPLATE_CONTEXT_PROCESSORS = (
    "django.contrib.auth.context_processors.auth",
    "django.core.context_processors.debug",
    "django.core.context_processors.i18n",
    "django.core.context_processors.media",
    "django.core.context_processors.static",
    "django.core.context_processors.tz",
    "django.core.context_processors.request",
    "django.contrib.messages.context_processors.messages",
    "appfx.context_processors.appfx")

ROOT_URLCONF = 'urls'

# Python dotted path to the WSGI application used by Django's runserver.
WSGI_APPLICATION = 'wsgi.application'

TEMPLATE_DIRS = (
    # Put strings here, like "/home/html/django_templates" or "C:/www/django/templates".
    # Always use forward slashes, even on Windows.
    # Don't forget to use absolute paths, not relative paths.
)

DEBUG_TOOLBAR_PANELS = (
    'debug_toolbar.panels.version.VersionDebugPanel',
    'debug_toolbar.panels.timer.TimerDebugPanel',
    'debug_toolbar.panels.settings_vars.SettingsVarsDebugPanel',
    'debug_toolbar.panels.headers.HeaderDebugPanel',
    'debug_toolbar.panels.request_vars.RequestVarsDebugPanel',
    #'debug_toolbar.panels.template.TemplateDebugPanel',
    'debug_toolbar.panels.logger.LoggingPanel',
    'appfx.debug.splunk_rest.SplunkRestDebugPanel',
)

DEBUG_TOOLBAR_CONFIG = {
    'INTERCEPT_REDIRECTS': False,
}

AUTHENTICATION_BACKENDS = (
    'appfx.auth.backends.SplunkAuthenticationBackend',
)

# Only if we are in test mode should we use the model backend
if TEST_MODE:
    AUTHENTICATION_BACKENDS += ('django.contrib.auth.backends.ModelBackend',)
    DATABASES['default'] = {
        'ENGINE': 'django.db.backends.sqlite3', 
        'NAME': 'testdb',
    }

INSTALLED_APPS = (
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.sites',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'debug_toolbar',
    'appfx',
)

# Auto-discover all user applications from the apps/ directory
USER_APPS = ()
for app_path in os.listdir(os.path.join(current_dir, "apps")):
    full_app_path = os.path.join(current_dir, "apps", app_path)
    is_dir = os.path.isdir(full_app_path)
    
    if not (is_dir or app_path.endswith(".py")):
        continue
    
    USER_APPS += ((app_path if is_dir else app_path[:-3]),)
    
INSTALLED_APPS += USER_APPS

DEFAULT_APP = 'homefx'

LOGIN_URL = "/%s/accounts/login/" % MOUNT
LOGIN_REDIRECT_URL = "/%s" % MOUNT
LOGOUT_URL = '/%s/accounts/logout/' % MOUNT
if APPFX_CONFIG.get('quickstart'):
    LOGIN_TEMPLATE = 'quickstartfx:login.html'
else:
    LOGIN_TEMPLATE = 'appfx:auth/registration/login.html'

SPLUNKD_HOST    = str(APPFX_CONFIG.get('splunkd_host'))
SPLUNKD_PORT    = int(APPFX_CONFIG.get('splunkd_port'))
SPLUNK_WEB_HOST = str(APPFX_CONFIG.get('splunkweb_host'))
SPLUNK_WEB_PORT = int(APPFX_CONFIG.get('splunkweb_port'))

PROXY_PATH = str(APPFX_CONFIG.get('proxy_path'))

# JS
JS_CACHE_DIR = "JS_CACHE"

CLIENT_CONFIG = {
    "STATIC_URL": str(STATIC_URL),
    "PROXY_PATH": str(PROXY_PATH)
}

# To allow multi-line templatetags, we have to modify the regex in
# django
import django.template.base
import re
tag_re_pattern = django.template.base.tag_re.pattern
tag_re_flags = django.template.base.tag_re.flags
django.template.base.tag_re = re.compile(tag_re_pattern, tag_re_flags | re.S)

# A sample logging configuration. The only tangible logging
# performed by this configuration is to send an email to
# the site admins on every HTTP 500 error when DEBUG=False.
# See http://docs.djangoproject.com/en/dev/topics/logging for
# more details on how to customize your logging configuration.
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'filters': {
        'require_debug_false': {
            '()': 'django.utils.log.RequireDebugFalse'
        }
    },
    'handlers': {
        'mail_admins': {
            'level': 'ERROR',
            'filters': ['require_debug_false'],
            'class': 'django.utils.log.AdminEmailHandler'
        }
    },
    'loggers': {
        'django.request': {
            'handlers': ['mail_admins'],
            'level': 'ERROR',
            'propagate': True,
        },
    }
}