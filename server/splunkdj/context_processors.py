from django.conf import settings
from django.core.urlresolvers import resolve

def splunkdj(request):
    """Add various fields used by the Splunk app framework."""
    match = resolve(request.path_info)
    built_files_root = None
    
    if not match.app_name and hasattr(match, 'kwargs'):
        match.app_name = match.kwargs.get('app', None)
    
    if settings.SPLUNK_WEB_INTEGRATED:
        built_files_root = "js/build/splunkjs"
    else:
        built_files_root = "splunkjs"

    if settings.USE_MINIFIED_FILES:
        built_files_root = built_files_root + ".min"
    
    
    return { 
        # Add common names used by various templates
        'app_name': match.app_name,
        'url_name': match.url_name,
        
        'USE_BUILT_FILES': settings.USE_BUILT_FILES,
        'USE_MINIFIED_FILES': settings.USE_MINIFIED_FILES,
        'BUILT_FILES_ROOT': built_files_root,
        
        'SPLUNKWEB_URL': "/%s/" % settings.SPLUNK_WEB_MOUNT if settings.SPLUNK_WEB_MOUNT else "/",
        'SPLUNKWEB_STATIC_URL': "/%s/static/" % settings.SPLUNK_WEB_MOUNT if settings.SPLUNK_WEB_MOUNT else "/static/",
        'SPLUNK_5': settings.SPLUNK_5
    }