from .widgets import LeftRightSelectMultiple
from datetime import date
from decimal import Decimal
from splunkdj.setup import forms   # instead of: from django import forms
from splunklib.binding import HTTPError
from splunklib.client import Entity
import urllib

# - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
# Enable Example #1: Single checkbox to toggle a group of inputs

def load_disabled(service):
    return Entity(service, 'data/inputs/script/.%2Fbin%2Fextract.py')['disabled']

def save_disabled(value, service):
    Entity(service, 'data/inputs/script/.%2Fbin%2Fextract.py').update(
        disabled=value)
    try:
        # SPL-56043: Fails on OS X for scripted inputs containing a backslash.
        Entity(service, 'data/inputs/script/.%5Cbin%5Cextract.py').update(
            disabled=value)
    except HTTPError as e:
        if e.status == 404:
            # Assume failure is due to running on OS X
            pass
        else:
            raise

# - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
# Enable Example #2: Standard multi-select to toggle individual inputs

# NOTE: This can be set to any iterable (including a generator function).
ENABLEABLE_INPUT_CHOICES = (
    ('./bin/extract.py', 'Flurry Input (Unix, Mac)'),
    ('.\\bin\\extract.py', 'Flurry Input (Windows)'),
)

def load_enabled_inputs(request, form_cls, field):
    service = request.service
    
    enabled_inputs = []
    for (input_name, _) in ENABLEABLE_INPUT_CHOICES:
        # SPL-56043: Fails on OS X for scripted inputs containing a backslash.
        try:
            input_enabled = _get_input(service, input_name)['disabled'] != '1'
            if input_enabled:
                enabled_inputs.append(input_name)
        except HTTPError as e:
            if e.status == 404:
                # Assume failure is due to running on OS X
                pass
            else:
                raise
    
    return enabled_inputs

def save_enabled_inputs(request, form_cls, field, enabled_inputs):
    service = request.service
    
    for (input_name, _) in ENABLEABLE_INPUT_CHOICES:
        # SPL-56043: Fails on OS X for scripted inputs containing a backslash.
        try:
            input = _get_input(service, input_name)
            input_enabled = input_name in enabled_inputs
            input.update(disabled='0' if input_enabled else '1')
        except HTTPError as e:
            if e.status == 404:
                # Assume failure is due to running on OS X
                pass
            else:
                raise

def _get_input(service, input_name):
    # NOTE: Between DVPL-1688 and DVPL-1846, it is easier to access the REST
    #       API directly instead of using an Input object.
    return Entity(service, 'data/inputs/script/%s' % urllib.quote_plus(input_name))

# - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 
# DOC: Custom load & save behavior can be specified for fields

def load_extraction_date(request, form_cls, field):
    service = request.service
    extract_position = service.confs['extract']['extract_position']
    try:
        return date(
            int(extract_position['year']),
            int(extract_position['month']),
            int(extract_position['day']))
    except ValueError:
        # The default values for these field components are non-integer placeholders.
        # In such a case, just return an empty field value.
        return None

def save_extraction_date(request, form, field, value):
    service = request.service
    service.confs['extract']['extract_position'].update(
        year=value.year,
        month=value.month,
        day=value.day,
    )

# - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 

class SetupForm(forms.Form):
    # Enable Example #0: Single checkbox to toggle a single input
    """
    disabled = forms.BooleanField(
        # NOTE: Unlike setup.xml, the 'entity' portion is escaped automatically.
        #       This seems like a more friendly behavior going forward.
        # NOTE: In setup.xml, you can use 'enabled' as a field name, even
        #       though it is not part of the REST API. There may be other
        #       such fields. An investigation is pending. (DVPL-1844)
        endpoint='data/inputs/script', entity='./bin/extract.py', field='disabled',
        label='Disable Flurry data collection',
        required=False,     # boolean fields must be non-required
        initial=True)       # speed up form testing
    """
    
    # Enable Example #1: Single checkbox to toggle a group of inputs
    """
    disabled = forms.BooleanField(
        load=load_disabled, save=save_disabled,
        label='Disable Flurry data collection',
        required=False,     # boolean fields must be non-required
        initial=True)       # speed up form testing
    """
    
    # Enable Example #2: Standard multi-select to toggle individual inputs
    enabled_inputs = forms.MultipleChoiceField(
        load=load_enabled_inputs, save=save_enabled_inputs,
        choices=ENABLEABLE_INPUT_CHOICES,
        # 2a: 'forms.CheckboxSelectMultiple()' is good for 2-7 choices
        # 2b: 'forms.SelectMultiple()' (default) is good for 5-15 choices
        # 2c: 'LeftRightSelectMultiple()' (a custom widget) is good for 7 or more choices
        widget=LeftRightSelectMultiple(),
        # 2b: Help text for SelectMultiple
        #help_text=
        #    'Multiple inputs can be selected by holding down ' +
        #    'Control (Linux, Windows) or Command (Mac) while clicking each ' +
        #    'desired input.',
        required=False,                 # permit empty selection
        # DOC: Upon initial view of setup screen, all fields are empty
        #      unless an initial value is specified in the field definition.
        #      In particular, no attempt is made to load any preexisting
        #      settings for the field that may exist.
        initial=['./bin/extract.py'])   # speed up form testing
    
    email = forms.EmailField(
        endpoint='configs/conf-extract', entity='auth', field='email',
        max_length=100,
        initial='foo@bar.com')  # speed up form testing
    password = forms.CharField(
        endpoint='configs/conf-extract', entity='auth', field='password',
        max_length=100,
        widget=forms.PasswordInput(render_value=True),
        initial='weak')  # speed up form testing
    project_id = forms.IntegerField(
        endpoint='configs/conf-extract', entity='auth', field='project_id',
        label='Project ID',
        min_value=1,
        help_text=
            'The project ID can be obtained by logging in to the Flurry ' +
            'dashboard, [...]?<b>projectID=<u>12345</u></b>&dashboardId=22',
        initial=42)  # speed up form testing
    
    # Date picker widget added via JavaScript
    extraction_date = forms.DateField(
        load=load_extraction_date, save=save_extraction_date)
    extraction_offset = forms.IntegerField(
        endpoint='configs/conf-extract', entity='extract_position', field='offset',
        min_value=0, initial=0,
        help_text='(When changing the day, also set this offset to 0.)')
    extraction_session = forms.IntegerField(
        endpoint='configs/conf-extract', entity='extract_position', field='session',
        min_value=0, initial=0,
        label='Next session id [Advanced]')
    
    delay_per_request = forms.DecimalField(
        endpoint='configs/conf-extract', entity='rate_limiting', field='delay_per_request',
        initial=Decimal('10.0'), min_value=0.0)
    delay_per_overlimit = forms.DecimalField(
        endpoint='configs/conf-extract', entity='rate_limiting', field='delay_per_overlimit',
        initial=Decimal('60.0'), min_value=0.0)