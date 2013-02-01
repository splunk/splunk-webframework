from django.contrib.auth.decorators import login_required
from appfx.decorators.render import render_to

@render_to('componentfx:home.html')
@login_required
def home(request):
    return {
        "app_name": "componentfx"
    }

@render_to('componentfx:test.html')
@login_required
def test(request):
    return {
        "app_name": "componentfx"
    }