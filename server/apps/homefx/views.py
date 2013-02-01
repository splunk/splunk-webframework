# Copyright 2012 Splunk, Inc.

from django.contrib.auth.decorators import login_required
from appfx.decorators.render import render_to

import settings

# A getattr that returns None instead of throwing AttributeException.
def _getattr(obj, attr):
    return getattr(obj, attr) if hasattr(obj, attr) else None

@render_to('homefx:home.html')
@login_required
def home(request):
    no_description = "No description has been provided for this app. Please update your app"

    apps = []
    for app in settings.USER_APPS:
        if app == "homefx": 
            continue

        module = __import__(app)
        if not module:
            continue

        info = {
            'author': _getattr(module, "__author__") or "",
            'description': _getattr(module, "__doc__") or no_description,
            'name': app,
            'label': _getattr(module, "__label__") or app,
            'license': _getattr(module, "__license__") or "",
            'version': _getattr(module, "__version__") or "0.0" }

        apps.append(info)

    return { 'apps': apps }
