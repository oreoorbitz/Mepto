var results = [];
// Test 1: filter by CSS selector
var divs = $('div');
results.push('filter by class: ' + (divs.filter('.active').length === 1));

// Test 2: filter by function with this.value
var nodes = $('<select><option value=1>test1</option><option value=2>test2</option><option value=1>test1</option></select>');
var filtered = nodes.find('option').filter(function(){ return this.value == '1' });
results.push('filter by function: ' + (filtered.length === 2));

// Test 3: filter by function receives index
var indexes = [];
nodes.find('option').filter(function(index){ if (this.value=='1') indexes.push(index) });
results.push('indexes: ' + (indexes.length === 2 && indexes[0] === 0 && indexes[1] === 2));

// Test 4: filter with non-existent selector
results.push('no match: ' + (divs.filter('.doesnotexist').length === 0));

// Test 5: filter with null
results.push('null selector: ' + (divs.filter(null).length === 0));

// Test 6: filter with undefined
results.push('undefined selector: ' + (divs.filter(undefined).length === 0));

return results.join(', ');
