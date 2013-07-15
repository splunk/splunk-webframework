/* -------------------------------------------------------------------------- */
/* LeftRightSelectMultiple Widget */

$('.left-right-select-multiple').each(function() {
    var control = this;

    var moveSelectedChoices = function(fromChoices, toChoices) {
        // Deselect everything in the destination
        toChoices.val([]);

        var choiceValsToMove = fromChoices.val() || [];
        
        var optionsToMove = [];
        $('option', fromChoices).each(function() {
            if (_.contains(choiceValsToMove, $(this).val())) {
                optionsToMove.push(this);
            }
        });

        _.each(optionsToMove, function(option) {
            toChoices.append($(option).detach());
        });
    };
    
    $('.move-right', control).click(function() {
        moveSelectedChoices(
            $('.left-choices', control),
            $('.right-choices', control));
    });

    $('.move-left', control).click(function() {
        moveSelectedChoices(
            $('.right-choices', control),
            $('.left-choices', control));
    });
});

$('form').submit(function() {
    $('.left-right-select-multiple', this).each(function() {
        var control = this;

        // Select everything on the left
        var allLeftChoiceVals = [];
        $('.left-choices option', control).each(function() {
            allLeftChoiceVals.push($(this).val());
        });
        $('.left-choices', control).val(allLeftChoiceVals);

        // Deselect everything on the right
        $('.right-choices', control).val([]);

        // TODO: Ideally prevent further user input on the choices.
        //       Unfortunately simply disabling them causes them
        //       to be omitted from the submitted data.
    });
});

/* -------------------------------------------------------------------------- */