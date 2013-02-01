from django.middleware.csrf import get_token
        
class SplunkCsrfMiddleware(object):
    def process_view(self, request, *args, **kwargs):
        get_token(request)
        return None