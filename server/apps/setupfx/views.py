# TODO: Move this section to a more appropriate file and import from here
from django import forms

class AppSettingsForm(forms.Form):
    email = forms.EmailField(max_length=100)

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
