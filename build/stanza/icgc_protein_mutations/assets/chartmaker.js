/*
 * Copyright 2013(c) The Ontario Institute for Cancer Research. All rights reserved.
 *
 * This program and the accompanying materials are made available under the terms of the GNU Public
 * License v3.0. You should have received a copy of the GNU General Public License along with this
 * program. If not, see <http://www.gnu.org/licenses/>.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 * FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 * WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY
 * WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

'use strict';

// A small adjustment to work around the context - this file might be run server-side with commonjs
// or client-side under Angular, which does no lazy loading and will therefore assume d3 has already
// been loaded. This should change if Angular gets better loading some day.

var reald3 = (typeof require === 'function') ? require("d3") : d3;
var d3 = reald3;

'use strict';

// The expected data is as follows: this does not need to be modelled exactly, as it
// can be generated on-demand. The data is an object with the following keys:
// start: nnn
// stop: nnn
// mutations: [{id: str, position: nnn, url: url, value: nnn,... }, ...]
// domains: [{id: str, label: str, url: url, start: nnn, stop: nnn,...},...]
// mutationHtmlFn: function(m) where m is a mutation
// domainHtmlFn: function(m) where m is a mutation

/**
 * Primary definition of the data used.
 */
var ProteinStructureChart = function (options, data) {

  /*
   * Configuration values explained:
   *   displayWidth - width of the main chart body for the coding region/protein
   *   valueHeight - height of the main chart body for values presented
   *   domainRowHeight - height of each row of domain information
   *   domainRowSeparation - separation between domain rows
   *   valueAxisWidth - width of the left margin axis for values
   *   structureAxisHeight - height of the axis for the coding region/protein
   *   topMargin, leftMargin, rightMargin, bottomMargin - margins for the display
   *   markerRadius - size of the circle to use marking a value
   */

  var config = {};

  var default_config = {
    displayWidth: 700,
    valueHeight: 140,
    domainRowHeight: 15,
    domainBarHeight: 7,
    domainRowSeparation: 2,
    domainBarLabels: ['pfam'],
    valueAxisWidth: 30,
    structureAxisHeight: 25,
    topMargin: 10,
    leftMargin: 10,
    rightMargin: 20,
    bottomMargin: 10,
    markerRadius: 4,
    domainTooltipHtmlFn: function (d) {
      return "<a href='#'>" + d.id + '</a><br>' + d.id;
    },
    domainTooltipOptions: {container: 'body', placement: 'bottom', html: true},
    markerTooltipHtmlFn: function (d) {
      return 'Mutation: ' + d.id;
    },
    markerTooltipOptions: {container: 'body', placement: 'left', html: true},
    markerClassFn: function (d) {
      return 'marker';
    },
    markerCircleClassFn: function (d) {
      return 'circle';
    },
    markerUrlFn: null
  };

  Object.keys(default_config).forEach(function (key) {
    config[key] = default_config[key];
  });
  Object.keys(options).forEach(function (key) {
    config[key] = options[key];
  });

  this.config = config;
  this.data = data;
};

/**
 * Algorithm to pack domains effectively. The rangeKeyFn is a function
 * that returns a [m, n] value from each data element. This is basically
 * a bin-packing problem, and we're using a first-fit decreasing algorithm
 * which isn't perfectly optimal, but not bad, especially since the data
 * will not be too tightly constrained.
 *
 * @return the number of bins required.
 */
ProteinStructureChart.prototype.packRanges = function (data, rangeKey) {
  var index = 0;
  var ranges = data.map(function (e) {
    var range = rangeKey(e);
    return { index: index++, range: range, size: range[1] - range[0] };
  });
  var sorted = ranges.sort(function (a, b) {
    return a.range[1] - b.range[1];
  });

  // Now we start.
  var length = data.length;
  var binRights = [];
  var binCount = 0;
  sorted: for (var i = 0; i < length; i++) {
    var next = sorted[i];
    var left = next.range[0];
    for (var j = 0; j < binCount; j++) {
      if (left > binRights[j]) {
        data[next.index].bin = j;
        binRights[j] = next.range[1];
        continue sorted;
      }
    }
    data[next.index].bin = binCount++;
    binRights.push(next.range[1]);
    continue sorted;
  }

  return binCount;
};

/**
 * This method adds the values to the overall chart. This is a fairly straight
 * use of d3.
 */
ProteinStructureChart.prototype.addValues = function () {
  var chart = this._chart;
  var values = this.data.mutations || [];

  var proteinScale = this._proteinScale;
  var valueScale = this._valueScale;
  var bottom = valueScale(0);
  var markerRadius = this.config.markerRadius;
  var bboxOffset = 2;

  function markerCxFn(d, i) {
    return proteinScale(d.position);
  }

  function markerCyFn(d, i) {
    return valueScale(d.value);
  }

  function markerBBoxX(d, i) {
    return markerCxFn(d, i) - (markerRadius + bboxOffset);
  }

  function markerBBoxY(d, i) {
    return markerCyFn(d, i) - (markerRadius + bboxOffset);
  }

  function markerBBoxSize(d, i) {
    return 2 * (markerRadius + bboxOffset);
  }

  function valuePathFn(d, i) {
    var x = proteinScale(d.position);
    var top = valueScale(d.value);
    return 'M' + x + ',' + Math.min(top + markerRadius - 1, bottom) + 'L' + x + ',' + bottom;
  }

  values = chart.selectAll('g.marker')
    .data(values)
    .enter()
    .append('g')
    .attr('class', this.config.markerClassFn);

  values.append('circle')
    .attr('cx', markerCxFn)
    .attr('cy', markerCyFn)
    .attr('class', this.config.markerCircleClassFn)
    .attr('r', markerRadius)
    .attr('rel', 'tooltip')
    .attr('title', this.config.markerTooltipHtmlFn)
    .on('click', this.config.markerUrlFn);

  values.append('path')
    .attr('d', valuePathFn);

};

/**
 * This method returns the main chart element. It's useful for server-side
 * work, where we need the element to render to text for embedding.
 */
ProteinStructureChart.prototype.getChartElement = function () {
  return d3.select(this.element);
};

/**
 * This method adds the domain elements to the overall chart. It's a fairly straight
 * use of d3 against the scales we already have.
 */
ProteinStructureChart.prototype.addDomains = function () {
  var domains = this.data.domains;
  if (!domains || domains.length == 0) {
    // No domains to render
    return;
  }

  var chart = this._chart;
  var proteinScale = this._proteinScale;
  var domainRowScale = this._domainRowScale;
  var domainColourScale = this._domainColourScale;
  var drh = this.config.domainRowHeight;
  // var drs = this.config.domainRowSeparation;
  var dbh = this.config.domainBarHeight;
  var dbl = this.config.domainBarLabels;
  var dbo = (drh - dbh) / 2;
  // var lm = this.config.leftMargin;

  function domainXFn(d, i) {
    return proteinScale(d.start);
  }

  function domainYFn(d, i) {
    return domainRowScale(d.bin);
  }

  function domainWidthFn(d, i) {
    return proteinScale(d.stop) - proteinScale(d.start);
  }

  function domainHeightFn(d, i) {
    return drh;
  }

  function domainColourFn(d, i) {
    return domainColourScale(d.id);
  }

  function domainLabelFn(d, i) {
    return d.id;
  }

  function domainRowLabelFn(d, i) {
    return d.label;
  }

  function domainRowYFn(d, i) {
    return domainRowScale(d.row) + dbo;
  }

  var rowCount = 1 + Math.max.apply(null, domains.map(function (d) {
    return d.bin;
  }));
  var rows = new Array(rowCount);
  for (var r = 0; r < rowCount; r++) {
    rows[r] = {row: r, label: dbl[r]};
  }
  var rowScale = proteinScale.range();

  var domainRows = chart.selectAll('g.domainRow')
    .data(rows)
    .enter()
    .append('g')
    .attr('class', 'domainRow');

  domainRows.append('rect')
    .attr('x', rowScale[0])
    .attr('y', domainRowYFn)
    .attr('width', rowScale[1] - rowScale[0])
    .attr('height', dbh)
    .attr('fill', '#ccc');

  domainRows.append('text')
    .attr('x', 1)
    .attr('y', domainRowYFn)
    .attr('dx', 1)
    .attr('dy', dbh)
    .text(domainRowLabelFn)
    .attr('fill', 'black');

  // Add the domain groups
  var domainGroups = chart.selectAll('g.domain')
    .data(domains)
    .enter()
    .append('g')
    .attr('class', 'domain');


  function highlightDomainFn(domain) {
    domainGroups.selectAll('rect')
      .filter(function (d) {
        return domain.id !== d.id;
      })
      .transition()
      .duration(250)
      .style('opacity', 0.1);
  }

  function unhighlightDomainFn(domain) {
    domainGroups.selectAll('rect')
      .transition()
      .duration(250)
      .style('opacity', 1.0);
  }

  domainGroups.attr('rel', 'tooltip')
    .attr('title', this.config.domainTooltipHtmlFn);

  // Add the domain rectables
  domainGroups.append('rect')
    .attr('x', domainXFn)
    .attr('y', domainYFn)
    .attr('width', domainWidthFn)
    .attr('height', domainHeightFn)
    .attr('rx', 5)
    .attr('ry', 5)
    .attr('fill', domainColourFn)
    .style('opacity', 1.0)
    .on('mouseover', highlightDomainFn)
    .on('mouseout', unhighlightDomainFn);

  // Add labels. Actually, it is moot whether we ought to do this, especially for
  // short domains. But it's good enough for now
  domainGroups.append('text')
    .attr('x', domainXFn)
    .attr('y', domainYFn)
    .attr('dx', 3)
    .attr('dy', drh - 4)
    .text(domainLabelFn)
    .attr('fill', 'black')
    .on('mouseover', highlightDomainFn)
    .on('mouseout', unhighlightDomainFn);
};

/**
 * Sets up the tooltips needed for the chart constituent elements. This is a Bootstrap/
 * jQuery level.
 */
ProteinStructureChart.prototype.addTooltips = function () {

  // Bail out sans jQuery, we're probably server-side
  if (typeof jQuery !== 'function') {
    return;
  }

  var element = this.element;
  jQuery(element).find('g.marker circle').tooltip(this.config.markerTooltipOptions);
  jQuery(element).find('g.marker circle').on('click', function () {
    jQuery(this).tooltip('destroy');
  });

  jQuery(element).find('g.domain').tooltip(this.config.domainTooltipOptions);
};

ProteinStructureChart.prototype.addChart = function () {

  // First calculate the overall chart dimensions
  var lm = this.config.leftMargin;
  var tm = this.config.topMargin;
  var rm = this.config.rightMargin;
  var bm = this.config.bottomMargin;
  var vaw = this.config.valueAxisWidth;
  var dw = this.config.displayWidth;
  var vh = this.config.valueHeight;
  var mv = this._maximumValue;
  var dr = this._domainRows;
  var drh = this.config.domainRowHeight;
  var drs = this.config.domainRowSeparation;
  var sah = this.config.structureAxisHeight;

  var height = tm + vh + bm + this.config.structureAxisHeight + (drh + drs) * this._domainRows - drs;
  var width = lm + vaw + dw + rm;

  // Now create a store the scales we need to transform data
  this._proteinScale = d3.scale.linear()
    .domain([this.data.start, this.data.stop])
    .range([lm + vaw, lm + vaw + dw]);
  this._valueScale = d3.scale.linear()
    .domain([mv, 0])
    .range([tm, tm + vh]);
  this._domainRowScale = d3.scale.linear()
    .domain([0, dr])
    .range([tm + vh + sah, tm + vh + sah + dr * (drh + drs)]);
  this._domainColourScale = d3.scale.category10();

  // Now the chart
  d3.select(this.element).html('');
  var chart = d3.select(this.element)
    .append('svg')
    .attr('class', 'proteinstructure')
    .attr('width', width)
    .attr('height', height);

  // And the axes; first for the values
  var xAxis = d3.svg.axis();
  xAxis.scale(this._proteinScale);
  xAxis.orient('bottom');
  chart.append('g')
    .attr('class', 'axis')
    .attr('transform', 'translate(' + 0 + ',' + (tm + vh - 0.5) + ')')
    .call(xAxis);

  // The second axis is the one for the protein coding space
  //var valueAxis = d3.svg.axis().ticks(6);
  var valueAxis = d3.svg.axis().ticks(Math.min(6, mv));

  // Supress decmials
  valueAxis.tickFormat(d3.format('d'));

  valueAxis.scale(this._valueScale);
  valueAxis.orient('left');
  chart.append('g')
    .attr('class', 'axis')
    .attr('transform', 'translate(' + (lm + vaw) + ',' + (-0.5) + ')')
    .call(valueAxis);

  chart.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('class', 'axis-label')
    .attr('y', 0)
    .attr('x', -tm)
    .attr('dy', '2ex')
    .attr('dx', -vh / 2)
    .style('text-anchor', 'middle')
    .text('# of donors');

  // We can label the value axis.

  this._chart = chart;
  return chart;
};

/**
 * Updates the values - they might arrive separately from the domains. Or not at all.
 */
ProteinStructureChart.prototype.setMutations = function (mutations) {
  this.data.mutations = mutations;
  this._maximumValue = Math.max.apply(null, this.data.mutations.map(function (e) {
    return e.value;
  }));

  this._valueScale = d3.scale.linear()
    .domain([this._maximumValue, 0])
    .range([this.config.topMargin, this.config.topMargin + this.config.valueHeight]);

  // The second axis is the one for the protein coding space
  //var valueAxis = d3.svg.axis().ticks(6);
  var valueAxis = d3.svg.axis().ticks(Math.min(6, this._maximumValue));

  // Suppress decimals
  valueAxis.tickFormat(d3.format('d'));

  valueAxis.scale(this._valueScale);
  valueAxis.orient('left');

  var chart = this._chart;
  chart.selectAll("g.y.axis")
    .call(valueAxis);

  // And now the values...
  this.addValues();
  this.addTooltips();
}

/**
 * Main display method sets up the chart.
 */
ProteinStructureChart.prototype.display = function (element) {
  this.element = element;

  var mutations = this.data.mutations || [];
  this._maximumValue = Math.max.apply(null, mutations.map(function (e) {
    return e.value;
  }));
  this._domains = this.data.domains;
  this._domainRows = this.packRanges(this.data.domains, function (e) {
    return [e.start, e.stop];
  });

  this.addChart();
  this.addDomains();
  this.addValues();
//  this.addTooltips();
};


ProteinStructureChart.prototype.displayError = function (element, errMsg) {
  this.element = element;
  d3.select(this.element).html('');
  d3.select(this.element)
    .append('div')
    .classed('empty', true)
    .append('h3')
    .text(errMsg);
};

if (typeof require === 'function') {
  module.exports = ProteinStructureChart;
}
