from django.core.exceptions import ImproperlyConfigured
from django.utils.functional import SimpleLazyObject


def get_service(request):
    if not hasattr(request, '_cached_service'): 
        if hasattr(request.user, 'service'):
            request._cached_service = request.user.service
        else:
            request._cached_service = None
    return request._cached_service
    
class SplunkAuthenticationMiddleware(object):
    def process_request(self, request):
        request.service = SimpleLazyObject(lambda: get_service(request))