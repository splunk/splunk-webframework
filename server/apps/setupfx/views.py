# TODO: Move this section to a more appropriate file and import from here
from decimal import Decimal
from django import forms

class AppSettingsForm(forms.Form):
    enable_input = forms.BooleanField(
        label='Enable Flurry data collection',
        initial=True, required=False)  # boolean fields must be non-required
    
    email = forms.EmailField(max_length=100)
    password = forms.CharField(max_length=100, widget=forms.PasswordInput())
    project_id = forms.IntegerField(max_value=1,
        label='Project ID',
        help_text=
            'The project ID can be obtained by logging in to the Flurry ' +
            'dashboard, [...]?<b>projectID=<u>12345</u></b>&dashboardId=22')
    
    delay_between_requests = forms.DecimalField(
        initial=Decimal('10.0'), min_value=0.0)
    delay_after_rate_limited = forms.DecimalField(
        initial=Decimal('60.0'), min_value=0.0)

# ------------------------------------------------------------------------------

from django.contrib.auth.decorators import login_required
from django.http import HttpResponseRedirect
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
    if request.method == 'POST':
        form = AppSettingsForm(request.POST)
        if form.is_valid():
            # TODO: Persist form data.
            # TODO: Mark app as setup.
            print 'setupfx: Received settings: ' + unicode(form.cleaned_data)
            
            # Return to home page
            # TODO: Use reverse function to get correct URL
            return HttpResponseRedirect('/appfx/setupfx/setup/')
    else:
        form = AppSettingsForm()
    
    return {
        'form': form,
    }
