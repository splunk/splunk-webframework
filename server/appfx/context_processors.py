# Copyright 2012 Splunk, Inc.

from django.core.urlresolvers import resolve

def appfx(request):
    """Add various fields used by the Splunk app frameowrk."""
    match = resolve(request.path_info)
    return { 
        # Add common names used by various templates
        'app_name': match.app_name,
        'url_name': match.url_name,

        # Add storage for static CSS and script files imported by components 
        'js_statics': {},
        'css_statics': {},
        'shim_storage': {},
        'options_storage': {},
        
        # This is a workaround that will allow us to use True and False
        # inside templates (e.g. to pass to template tags)
        'True': True,
        'False': False
    }

