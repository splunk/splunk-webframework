# TODO: Move this section to a more appropriate file and import from here
from decimal import Decimal
from django import forms

class AppSettingsForm(forms.Form):
    enable = forms.BooleanField(
        label='Enable Flurry data collection',
        initial=True, required=False)  # boolean fields must be non-required
    
    email = forms.EmailField(max_length=100,
        initial='foo@bar.com')  # speed up form testing
    password = forms.CharField(max_length=100, widget=forms.PasswordInput(),
        initial='weak')  # speed up form testing
    project_id = forms.IntegerField(min_value=1,
        label='Project ID',
        help_text=
            'The project ID can be obtained by logging in to the Flurry ' +
            'dashboard, [...]?<b>projectID=<u>12345</u></b>&dashboardId=22',
        initial=42)  # speed up form testing
    
    delay_per_request = forms.DecimalField(
        initial=Decimal('10.0'), min_value=0.0)
    delay_per_overlimit = forms.DecimalField(
        initial=Decimal('60.0'), min_value=0.0)

# ------------------------------------------------------------------------------

from appfx.decorators.render import render_to
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseRedirect
from splunklib.binding import namespace
from splunklib.client import Service

@render_to('setupfx:home.html')
@login_required
def home(request):
    # Redirect to setup screen if not configured
    service = _create_service()
    if not _get_configured(service):
        # TODO: Use reverse function to get correct URL
        return HttpResponseRedirect('/appfx/setupfx/setup/')
    
    return {
        "app_name": "setupfx",
    }

@render_to('setupfx:setup.html')
@login_required
def setup(request):
    if request.method == 'POST':
        form = AppSettingsForm(request.POST)
        if form.is_valid():
            service = _create_service()
            _save_settings(service, form.cleaned_data)
            _set_configured(service, True)
            
            # TODO: Use reverse function to get correct URL
            return HttpResponseRedirect('/appfx/setupfx/home/')
    else:
        form = AppSettingsForm()
        # TODO: If already configured, bind the form with the preexisting settings
    
    return {
        'form': form,
    }

@login_required
def unconfigure(request):
    service = _create_service()
    _set_configured(service, False)
    
    # TODO: Use reverse function to get correct URL
    return HttpResponseRedirect('/appfx/setupfx/home/')

# ------------------------------------------------------------------------------

def _create_service():
    service = Service(
        # TODO: Determine how to get Service for the currently authenticated user
        username='admin', password='weak',
        # TODO: Don't mess with other app's configuration
        owner='admin', app='flurry')
    service.login()
    return service

def _save_settings(service, settings):
    # (Avoid actual scripted input manipulations in our prototype)
    if False:
        # NOTE: Need to manually escape forward slashes for now. (DVPL-1688)
        input_1 = service.inputs['.%2Fbin%2Fextract.py', 'script']
        input_1.enable() if settings['enable'] else input_1.disable()
    
        input_2 = service.inputs['.\\bin\\extract.py', 'script']
        input_2.enable() if settings['enable'] else input_2.disable()
    
    conf = service.confs['extract']
    conf['auth'].update(
        email=settings['email'],
        password=settings['password'],
        project_id=settings['project_id'],
    )
    conf['rate_limiting'].update(
        delay_per_request=settings['delay_per_request'],
        delay_per_overlimit=settings['delay_per_overlimit'],
    )

def _get_configured(service):
    return (service.confs['app']['install']['is_configured'] == '1')

def _set_configured(service, configured):
    service.confs['app']['install'].update(is_configured=1 if configured else 0)