from .forms import SetupForm, StockSetupForm, SetupFormWithStockField
from django.shortcuts import redirect
from django.contrib.auth.decorators import login_required
from django.core.urlresolvers import reverse
from splunkdj.decorators.render import render_to
from splunkdj.setup import config_required, create_setup_view_context


### Normal Views ###

CONTROL_VIEW_NAMES = [
    "allviews",
    "controlslist",
    "resulttable",
    "single",
    "searchbar",
    "timepicker",
    "timeline",
    "eventtable",
    "forms",
    "charts",
    "googlemap",
]

@render_to()
@login_required
def controls_view(request, id="controls"):
    if not id in CONTROL_VIEW_NAMES:
        id = "controls"
    return {"TEMPLATE": "testfx:%s.html" % id}

@render_to()
@login_required
def next_controls_view(request, id="controls"):
    if id in CONTROL_VIEW_NAMES:
        next_index = CONTROL_VIEW_NAMES.index(id) + 1
        id = "controls" if next_index >= len(CONTROL_VIEW_NAMES) else CONTROL_VIEW_NAMES[next_index]
    return redirect('testfx:controls', id=id)

@render_to()
@login_required
def prev_controls_view(request, id="controls"):
    if id in CONTROL_VIEW_NAMES:
        prev_index = CONTROL_VIEW_NAMES.index(id) - 1
        id = "controls" if next_index >= len(CONTROL_VIEW_NAMES) else CONTROL_VIEW_NAMES[next_index]
    return redirect('testfx:controls', id=id)


### Setup View Tests ###

home_with_config_required_called = False

@render_to('testfx:setup.html')
@login_required
def setup(request):
    return create_setup_view_context(
        request,
        SetupForm,
        reverse('testfx:home'))

@render_to('testfx:setup.html')
@login_required
def setup_with_stock_form(request):
    return create_setup_view_context(
        request,
        StockSetupForm,
        reverse('testfx:home'))

@render_to('testfx:setup.html')
@login_required
def setup_with_stock_field(request):
    return create_setup_view_context(
        request,
        SetupFormWithStockField,
        reverse('testfx:home'))

@render_to('testfx:home.html')
@login_required
@config_required
def home_with_config_required(request):
    global home_with_config_required_called
    home_with_config_required_called = True
    
    return {}

@render_to('testfx:home.html')
@config_required
def home_with_config_required_only(request):
    return {}