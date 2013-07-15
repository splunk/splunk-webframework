from django.contrib.auth.decorators import login_required
from splunkdj.decorators.render import render_to

@render_to('examplesfx:home.html')
@login_required
def home(request):
    return {
        "message": "Hello World from examplesfx!",
        "app_name": "examplesfx"
    }

@render_to()
@login_required
def render_page(request, tmpl="examplesfx:home.html"):
    return {
        "TEMPLATE": "examplesfx:%s.html" % tmpl
    }