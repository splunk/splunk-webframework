from django.contrib.auth.decorators import login_required
from appfx.decorators.render import render_to

@render_to('setupfx:home.html')
@login_required
def home(request):
    return {
        "message": "Hello World from setupfx!",
        "app_name": "setupfx"
    }

@render_to('setupfx:setup.html')
@login_required
def setup(request):
    return {
        # No parameters
    }
