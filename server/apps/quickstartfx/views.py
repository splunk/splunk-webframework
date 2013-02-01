from django.shortcuts import redirect
from django.contrib.auth.decorators import login_required
from appfx.decorators.render import render_to

def home(request):
    if request.user and request.user.is_authenticated():
        return redirect('quickstartfx:steps', id=3)
    else:
        return redirect("quickstartfx:credentials") 

@render_to()
@login_required
def steps_view(request, id=3):
    return {
        "TEMPLATE": "quickstartfx:%s.html" % id,
    }