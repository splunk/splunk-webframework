class TokenSafeString(object):
    """
    Wraps a string to mark it to be interpreted as a template
    that needs to be substituted.
    """
    
    def __init__(self, value):
        self.value = value
    
    def __repr__(self):
        return 'TokenSafeString(%s)' % repr(self.value)
    
    def __str__(self):
        return str(self.value)
    
    def __unicode__(self):
        return unicode(self.value)
