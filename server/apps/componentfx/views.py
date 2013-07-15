from django.contrib.auth.decorators import login_required
from splunkdj.decorators.render import render_to

@render_to('componentfx:home.html')
@login_required
def home(request):
    return {
        "app_name": "componentfx"
    }

@render_to()
@login_required
def render_page(request, tmpl="componentfx:home.html"):
    return {
        "TEMPLATE": "componentfx:%s.html" % tmpl
    }