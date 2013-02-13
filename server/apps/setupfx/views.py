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
    delay_after_rate_limited = forms.DecimalField(
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
    print 'setupfx: is_configured: ' + repr(service.confs['app']['install']['is_configured'])
    if service.confs['app']['install']['is_configured'] != '1':
        # TODO: Use reverse function to get correct URL
        return HttpResponseRedirect('/appfx/setupfx/setup/')
    
    return {
        "message": "Hello World from setupfx!",
        "app_name": "setupfx"
    }

@render_to('setupfx:setup.html')
@login_required
def setup(request):
    if request.method == 'POST':
        form = AppSettingsForm(request.POST)
        if form.is_valid():
            print 'setupfx: Received settings: ' + unicode(form.cleaned_data)
            
            service = _create_service()
            
            # Persist form data
            _save_settings(service, form)
            
            # Mark app as configured
            service.confs['app']['install'].update(is_configured=1)
            
            # Return to home page
            # TODO: Use reverse function to get correct URL
            return HttpResponseRedirect('/appfx/setupfx/home/')
    else:
        form = AppSettingsForm()
    
    return {
        'form': form,
    }

def _create_service():
    service = Service(
        # TODO: Determine how to get Service for the currently authenticated user
        username='admin', password='weak',
        # TODO: Don't mess with other app's configuration
        owner='admin', app='flurry')
    service.login()
    return service

def _save_settings(service, form):
    # NOTE: Need to manually escape forward slashes for now. (DVPL-1688)
    input_1 = service.inputs['.%2Fbin%2Fextract.py', 'script']
    input_2 = service.inputs['.\\bin\\extract.py', 'script']
    if form.cleaned_data['enable']:
        #input_1.enable()   # avoid actual scripted input manipulations in our prototype
        input_2.enable()
    else:
        #input_1.disable()
        input_2.disable()
    
    settings = service.confs['extract']
    settings['auth'].update(
        email=form.cleaned_data['email'],
        password=form.cleaned_data['password'],
        project_id=form.cleaned_data['project_id'],
    )
    settings['rate_limiting'].update(
        delay_per_request=form.cleaned_data['delay_per_request'],
        delay_per_overlimit=form.cleaned_data['delay_per_overlimit'],
    )