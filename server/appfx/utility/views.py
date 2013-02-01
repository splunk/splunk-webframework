from django.contrib.auth.decorators import login_required as require_login
from django.shortcuts import render_to_response
from django.template import RequestContext

def render_template(template, mimetype=None, login_required=True):
    def renderer(request, *args, **kwargs):
        return render_to_response(
            template,
            kwargs,
            context_instance=RequestContext(request))
        
    return require_login(renderer) if login_required else renderer