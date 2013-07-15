"""
Server-side unit tests for the app framework.
"""

from django.conf import settings
from django.http import HttpResponseRedirect
from django.test import TestCase
import os
from splunkdj.setup import config_required, get_configured, set_configured
from splunklib.client import Service
import testfx.forms
import testfx.views


def _setup_service(self):
    if 'SPLUNK_TEST_USERNAME' not in os.environ:
        raise ValueError(
            'No Splunk username provided to test runner. ' +
            'Please use --user=USERNAME option.')
    if 'SPLUNK_TEST_PASSWORD' not in os.environ:
        raise ValueError(
            'No Splunk password provided to test runner. ' + 
            'Please use --password=PASSWORD option.')
    
    self.username = os.environ['SPLUNK_TEST_USERNAME']
    self.password = os.environ['SPLUNK_TEST_PASSWORD']
    
    # Login to splunkd ('self.service')
    self.service = Service(
        username=self.username,
        password=self.password,
        scheme=settings.SPLUNKD_SCHEME,
        host=settings.SPLUNKD_HOST,
        port=settings.SPLUNKD_PORT,
        owner='nobody',
        app='testfx'
    )
    self.service.login()
    
    # Ensure local copy of settings.conf matches the default copy
    set_configured(self.service, False)
    self.service.confs['settings']['auth'].update(**{
        'email': '__DEFAULT_EMAIL__',
        'password': '__DEFAULT_PASSWORD__',
    })
    testfx.forms.custom_persisted_value = '__DEFAULT_CUSTOM_PERSISTED_VALUE__'
    testfx.views.home_with_config_required_called = False


class SetupViewTests(TestCase):
    def setUp(self):
        _setup_service(self)
        
        # Login to splunkweb ('self.client')
        self.client.login(username=self.username, password=self.password)
        
    
    def test_can_render_setup_view_with_unbound_form(self):
        response = self.client.get('/testfx/setup/', {})
        self.assertIn('<form', response.content,
            'Expected <form> to be rendered.')
        self.assertNotIn('__DEFAULT_EMAIL__', response.content,
            'Expected unconfigured app to render setup form as unbound. ' +
            'This implies that fields should take on their configured '+
            '"initial" value, if specified.')
        self.assertIn('__INITIAL_EMAIL__', response.content,
            'Expected unconfigured app to render setup form as unbound. ' +
            'This implies that fields should take on their configured '+
            '"initial" value, if specified.')
    
    def test_can_load_form_with_endpoint_bound_field(self):
        set_configured(self.service, True)
        
        response = self.client.get('/testfx/setup/', {})
        self.assertIn('__DEFAULT_EMAIL__', response.content,
            'Expected configured app to render field with value loaded from endpoint.')
    
    def test_can_save_form_with_endpoint_bound_field(self):
        response = self.client.post('/testfx/setup/', {
            'email': 'local_email@contoso.com',
            'password': 'local_password',
        })
        
        self.assertTrue(get_configured(self.service))
        self.assertEqual(
            self.service.confs['settings']['auth']['email'],
            'local_email@contoso.com')
        self.assertEqual(
            self.service.confs['settings']['auth']['password'],
            'local_password')
    
    def test_can_load_form_with_custom_bound_field(self):
        set_configured(self.service, True)
        
        response = self.client.get('/testfx/setup/', {})
        self.assertIn('__DEFAULT_CUSTOM_PERSISTED_VALUE__', response.content,
            'Expected configured app to render field with value loaded from custom backend.')
    
    def test_can_save_form_with_endpoint_bound_field(self):
        response = self.client.post('/testfx/setup/', {
            'custom_persisted': 'local_custom_persisted_value'
        })
        
        self.assertTrue(get_configured(self.service))
        self.assertEqual(
            testfx.forms.custom_persisted_value,
            'local_custom_persisted_value')
    
    def test_cannot_instantiate_unbound_field(self):
        from splunkdj.setup import forms
        
        with self.assertRaisesRegexp(
                ValueError,
                'Expected either the keyword arguments ' +
                    '{"endpoint", "entity", "field"} or {"load", "save"}.'):
            # Normally this declaration would appear in forms.py
            # as a member of a forms.Form subclass and fail at the time
            # that forms.py is imported.
            custom_persisted = forms.CharField(
                max_length=100,
                initial='__INITIAL_CUSTOM_PERSISTED_VALUE__',
                required=False)
    
    def test_cannot_load_setup_view_with_stock_django_form(self):
        with self.assertRaisesRegexp(
                ValueError,
                'Expected form class StockSetupForm to have "load" ' +
                'and "save" methods. Are you passing a django.forms.Form ' +
                'instead of a splunkdj.setup.forms.Form?'):
            self.client.get('/testfx/setup_with_stock_form/', {})
    
    def test_cannot_save_setup_view_with_stock_django_form(self):
        with self.assertRaisesRegexp(
                ValueError,
                'Expected form class StockSetupForm to have "load" ' +
                'and "save" methods. Are you passing a django.forms.Form ' +
                'instead of a splunkdj.setup.forms.Form?'):
            self.client.get('/testfx/setup_with_stock_form/', {
                'email': 'local_email@contoso.com'
            })
    
    def test_cannot_load_form_with_stock_django_field(self):
        set_configured(self.service, True)
        
        with self.assertRaisesRegexp(
                ValueError,
                'Expected field "email" of type EmailField on ' +
                'SetupFormWithStockField to have "load" and "save" methods. ' +
                'Was this declared as a django.forms.Field instead of as a ' +
                'splunkdj.setup.forms.Field?'):
            self.client.get('/testfx/setup_with_stock_field/', {})
    
    def test_cannot_save_form_with_stock_django_field(self):
        with self.assertRaisesRegexp(
                ValueError,
                'Expected field "email" of type EmailField on ' +
                'SetupFormWithStockField to have "load" and "save" methods. ' +
                'Was this declared as a django.forms.Field instead of as a ' +
                'splunkdj.setup.forms.Field?'):
            self.client.post('/testfx/setup_with_stock_field/', {
                'email': 'local_email@contoso.com'
            })
    
    def test_config_required_will_redirect_if_app_not_configured(self):
        self.assertFalse(get_configured(self.service))
        
        response = self.client.get('/testfx/home_with_config_required/', {})
        self.assertIsInstance(response, HttpResponseRedirect)
        self.assertIn('/testfx/setup/', response['Location'])
    
    def test_config_required_will_not_redirect_if_app_configured(self):
        set_configured(self.service, True)
        
        response = self.client.get('/testfx/home_with_config_required/', {})
        self.assertNotIsInstance(response, HttpResponseRedirect)
        self.assertTrue(testfx.views.home_with_config_required_called)


class UnauthenticatedSetupViewTests(TestCase):
    def setUp(self):
        _setup_service(self)
    
    def test_config_required_implies_login_required(self):
        self.assertFalse(get_configured(self.service))
        
        response = self.client.get('/testfx/home_with_config_required_only/', {})
        self.assertIsInstance(response, HttpResponseRedirect)
        self.assertIn(
            '/accounts/login/?next=/testfx/home_with_config_required_only/',
            response['Location'])
