from .forms import SetupForm
from django.contrib.auth.decorators import login_required
from django.core.urlresolvers import reverse
from django.http import HttpResponseRedirect
from splunkdj.decorators.render import render_to
from splunkdj.setup import config_required
from splunkdj.setup import create_setup_view_context
from splunkdj.setup import set_configured

@render_to('setupfx:home.html')
@login_required
@config_required
def home(request):
    return {
        "app_name": "setupfx",
    }

@render_to('setupfx:setup.html')
@login_required
def setup(request):
    return create_setup_view_context(
        request,
        SetupForm,
        reverse('setupfx:home'))

@login_required
def unconfigure(request):
    service = request.service
    set_configured(service, False)
    
    return HttpResponseRedirect(reverse('setupfx:home'))
