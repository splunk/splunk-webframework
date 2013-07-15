from django import forms as stockforms
from django.http import HttpRequest
from splunkdj.setup import forms


custom_persisted_value = '__DEFAULT_CUSTOM_PERSISTED_VALUE__'

def load_custom_persisted(request, form_cls, field):
    # Assert that parameters have the expected types
    assert isinstance(request, HttpRequest), \
        '"request" parameter has unexpected type ' + type(request).__name__
    assert form_cls == SetupForm, \
        '"form_cls" parameter has unexpected value ' + repr(form_cls)
    assert isinstance(field, forms.CharField), \
        '"field" parameter does not appear to match ' + \
            'SetupForm.custom_persisted: ' + repr(field)
    
    return custom_persisted_value

def save_custom_persisted(request, form, field, value):
    # Assert that parameters have the expected types
    assert isinstance(request, HttpRequest), \
        '"request" parameter has unexpected type ' + type(request).__name__
    assert type(form) == SetupForm, \
        '"form" parameter has unexpected type ' + type(form).__name__
    assert isinstance(field, forms.CharField), \
        '"field" parameter does not appear to match ' + \
            'SetupForm.custom_persisted: ' + repr(field)
    # (forms.CharField should always have a cleaned value of type unicode, not str)
    assert isinstance(value, unicode), \
        '"value" parameter has unexpected type ' + type(value).__name__
    
    global custom_persisted_value
    custom_persisted_value = value


class SetupForm(forms.Form):
    email = forms.EmailField(
        endpoint='configs/conf-settings', entity='auth', field='email',
        max_length=100,
        initial='__INITIAL_EMAIL__',
        required=False)
    password = forms.CharField(
        endpoint='configs/conf-settings', entity='auth', field='password',
        max_length=100,
        widget=forms.PasswordInput(render_value=True),
        initial='__INITIAL_PASSWORD__',
        required=False)
    custom_persisted = forms.CharField(
        load=load_custom_persisted, save=save_custom_persisted,
        max_length=100,
        initial='__INITIAL_CUSTOM_PERSISTED_VALUE__',
        required=False)


class StockSetupForm(stockforms.Form):
    email = stockforms.EmailField(
        max_length=100,
        initial='__INITIAL_EMAIL__',
        required=False)


class SetupFormWithStockField(forms.Form):
    email = stockforms.EmailField(
        max_length=100,
        initial='__INITIAL_EMAIL__',
        required=False)
