function setUpSearch (selector) {
    // Search listener
    document.querySelector(selector).onSearch(function (filters) {
        var text = filters.tText;
        var filterTargets = refs.tree._refs.tree.children;
        var target = refs.tree._refs.tree.children;
        // Loop filtering targets
        refs.tree.refresh(text);
        // for (var i = 0; i < filterTargets.length; i++) {
        //     target = filterTargets[i];
        //     // Check matches
        //     if (~target.path.toLowerCase().indexOf(name.toLowerCase())) {
        //         target.classList.remove("notVisible");
        //     } else {
        //         target.classList.add("notVisible");
        //     }
        // }
    });
}

function loadVCometExamples () {
    // Configure tree
    refs.tree.vcometScroll.thickness = "10";
    // Load vComet element example
    refs.tree.onNodeSelected(function(node) {
        refs.view.swapToPanel(node.id);
        // Update scroll
        refs.view.getActivePanel().vcometScroll.update();
    })
}