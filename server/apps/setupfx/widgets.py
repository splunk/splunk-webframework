from django.forms.util import flatatt
from django.forms.widgets import SelectMultiple
from django.utils.safestring import mark_safe

class LeftRightSelectMultiple(SelectMultiple):
    # The 'choices' parameter is an extra set of choices in addition to
    # 'self.choices'. It is provided for compatibility with the Select superclass.
    def render(self, name, value, attrs=None, choices=()):
        if value is None: value = []
        
        final_attrs = self.build_attrs(attrs, name=name)
        all_choices = list(self.choices) + list(choices)
        all_choice_values = [v for (v,l) in all_choices]
        unselected_value = set(all_choice_values) - set(value)
        
        output = [
            u'<div class="left-right-select-multiple">',
            u'<select class="choices left-choices" multiple="multiple"%s>' % flatatt(final_attrs),
            self.render_options_2(
                _choices_intersection(all_choices, value), []),
            u'</select>',
            u'<input class="move-left" type="button" value="<--"/>',
            u'<input class="move-right" type="button" value="-->"/>',
            u'<select class="choices right-choices" multiple="multiple">',
            self.render_options_2(
                _choices_intersection(all_choices, unselected_value), []),
            u'</select>',
            u'</div>']
        return mark_safe(u'\n'.join(output))
    
    # Very similar to Select.render_options(), but the 'choices' argument is
    # interpreted to be the *complete* set of choices, instead of as an
    # addendum to 'self.choices'.
    def render_options_2(self, choices, selected_choices):
        # Normalize to strings.
        selected_choices = set(force_unicode(v) for v in selected_choices)
        output = []
        for option_value, option_label in choices:
            if isinstance(option_label, (list, tuple)):
                output.append(u'<optgroup label="%s">' % escape(force_unicode(option_value)))
                for option in option_label:
                    output.append(self.render_option(selected_choices, *option))
                output.append(u'</optgroup>')
            else:
                output.append(self.render_option(selected_choices, option_value, option_label))
        return u'\n'.join(output)


# Returns the sublist of 'choices' whose values are in 'value_subset'.
def _choices_intersection(choices, value_subset):
    choices_sublist = []
    for (value, label) in choices:
        if value in value_subset:
            choices_sublist.append((value, label))
    return choices_sublist
