'use strict';

function MRIViewer(myParams) {
  var me = {
      mriPath: null,          // Path to mri
      mrijs_url: 'https://rawgit.com/r03ert0/mrijs/master/mri.js', //'http://localhost/mrijs/mri.js',
      elem: null,             // Dom element to display the viewer
      mri: null,              // Mri data
      view: null,             // View: sag, axi or cor
      space: null,            // Space: voxel or world
      slice: null,            // Slice number
      maxSlice: null,         // Maximum slice number for the selected view
      canvas: null,           // Canvas element in dom
      context: null,          // Canvas's context
      W: null,                // Canvas's width
      H: null,                // Canvas's height
      D: null,                // Canvas's depth
      offCanvas: null,        // Offscreen canvas
      offContext: null,       // Ofscreen canvas's context
      offPixelBuffer: null,   // Offscreen pixel buffer

      // script loader
      loadScript: function loadScript(path, testScriptPresent) {
          var pr = new Promise(function (resolve, reject) {
              if (testScriptPresent && testScriptPresent()) {
                console.log('[loadScript] Script', path, 'already present, not loading it again');
                resolve();
              }

              var s = document.createElement('script');
              s.src = path;
              s.onload = function () {
                  console.log('Loaded', path);
                  resolve();
                  return;
                };

              s.onerror = function () {
                  console.error('ERROR');
                  reject();
                  return;
                };

              document.body.appendChild(s);
            });

          return pr;
        },

      init: function init() {
          var pr = new Promise(function (resolve, reject) {
              me.loadScript(me.mrijs_url, function () {
                  return window.MRI != undefined;
                })
                /*
                me.loadScript('https://cdn.rawgit.com/r03ert0/mrijs/v0.0.2/mri.js',function (){return window.MRI!=undefined})
                */
                .then(function () {
                    resolve();
                  });
            });

          return pr;
        },

      configure: function configure(params) {
          // Display loading message
          me.elem.innerHTML = '<b>Loading...</b>';

          var pr = new Promise(function (resolve, reject) {
              // Load MRI
              me.mri = new MRI();
              me.mri.init()
              .then(function () {
                  return me.mri.loadMRIFromPath(me.mriPath);
                })
              .then(function () {
                  var slice, i, arr;

                  // Append the graphic interface
                  me.makeGUI();

                  // Get canvas and context
                  me.canvas = me.elem.getElementsByTagName('canvas')[0];
                  me.context = me.canvas.getContext('2d');
                  me.offCanvas = document.createElement('canvas'),
                  me.offContext = me.offCanvas.getContext('2d');

                  // Set defaults
                  me.space = 'world';
                  me.setView('sag', false);

                  slice = me.elem.getElementsByClassName('slice')[0];
                  slice.value = me.slice;
                  slice.max = me.maxSlice;

                  // Set maximum display grey level to 99.99% quantile
                  arr = [];
                  for (i = 0; i < me.mri.data.length; i += parseInt(me.mri.data.length / 10000)) {
                    arr.push(me.mri.data[i]);
                  }

                  arr = arr.sort(function (a, b) { return a - b;});

                  window.testArr = arr;
                  me.maxValue = arr[9999];

                  // Draw
                  me.draw();

                  // Resolve
                  resolve();
                });
            });

          return pr;
        },

      makeGUI: function makeGUI() {
          // Append and connect user interface
          me.elem.style.display = 'inline-block';
          me.elem.style.position = 'relative';
          me.elem.innerHTML = [
              '<div class="wrap" style="position:relative;display:inline-block">',
                  '<canvas class="viewer" style="width:600px;background:grey"></canvas>',
                  '<div class="info" style="position:absolute;top:0;left:0;width:100%;height:100%;color:white">',
                      '<b class="N" style="position:absolute;top:0;left:0"></b>',
                      '<b class="L" style="position:absolute;top:50%;left:0;color:white"></b>',
                      '<b class="R" style="position:absolute;top:50%;right:0"></b>',
                      '<b class="S" style="position:absolute;top:0;left:50%"></b>',
                      '<b class="I" style="position:absolute;bottom:0%;left:50%"></b>',
                  '</div>',
              '</div>',
              '<br />',
              '<button class="sag-btn">Sagittal</button>',
              '<button class="axi-btn">Axial</button>',
              '<button class="cor-btn">Coronal</button>',
              '<select class="spa-btn">',
                  '<option value="world">World</option>',
                  '<option value="voxel">Voxel</option>',
              '</select>',
              '<br />',
              '<input class="slice" type="range" step="any" style="width:600px"></input>',
              '<br />',
          ].join('\n');
          var sagBtn = me.elem.getElementsByClassName('sag-btn')[0];
          var axiBtn = me.elem.getElementsByClassName('axi-btn')[0];
          var corBtn = me.elem.getElementsByClassName('cor-btn')[0];
          var spaBtn = me.elem.getElementsByClassName('spa-btn')[0];
          var slice = me.elem.getElementsByClassName('slice')[0];
          sagBtn.addEventListener('click', function () {
            me.setView('sag');slice.max = me.maxSlice;
          });

          axiBtn.addEventListener('click', function () {
            me.setView('axi');slice.max = me.maxSlice;
          });

          corBtn.addEventListener('click', function () {
            me.setView('cor');slice.max = me.maxSlice;
          });

          spaBtn.addEventListener('change', function () {me.setSpace(this.value);});

          slice.addEventListener('input', function () {me.setSlice(parseInt(this.value));});
        },

      display: function display() {
          return me.init().then(function () { return me.configure();});
        },

      draw: function draw() {
          switch (me.space) {
          case 'voxel':
            me.drawVoxelSpace();
          break;
          case 'world':
            me.drawScreenSpace();
          break;
        }
        },

      drawVoxelSpace: function drawVoxelSpace() {
          var dim = me.mri.dim,
            pixdim = me.mri.pixdim,
            s, i, val,
            x, y,
            ys, yc, ya;

          ys = me.slice;
          yc = me.slice;
          ya = me.slice;
          for (y = 0; y < me.H; y++) {
            for (x = 0; x < me.W; x++) {
              switch (me.view) {
              case 'sag':s = [ys, x, me.H - 1 - y]; break;
              case 'cor':s = [x, yc, me.H - 1 - y]; break;
              case 'axi':s = [x, me.H - 1 - y, ya]; break;
            }
              i = s[ 2 ] * me.mri.dim[ 1 ] * me.mri.dim[0] + s[ 1 ] * me.mri.dim[0] + s[0];

              // Draw 1d (anatomy) and 3d (colour dti) voxels
              if (me.mri.datadim == 3) {
                c = [
                    255 * me.mri.data[ i ] / me.maxValue,
                    255 * me.mri.data[ i + sz ] / me.maxValue,
                    255 * me.mri.data[ i + 2 * sz ] / me.maxValue,
                    255,
                ];
              } else {
                val = 255 * me.mri.data[ i ] / me.maxValue;
                c = [val, val, val, 255];
              }

              i = (y * me.offCanvas.width + x) * 4;
              me.offPixelBuffer.data[ i ]  = c[0];
              me.offPixelBuffer.data[ i + 1 ] = c[ 1 ];
              me.offPixelBuffer.data[ i + 2 ] = c[ 2 ];
              me.offPixelBuffer.data[ i + 3 ] = c[ 3 ];
            }
          }

          me.offContext.putImageData(me.offPixelBuffer, 0, 0);
          me.context.drawImage(me.offCanvas, 0, 0, me.W, me.H * me.Hdim / me.Wdim);
        },

      S2I: function S2I(s) {
          var s2v = me.mri.s2v;
          var v = [s2v.X + s2v.dx * s[ s2v.x ], s2v.Y + s2v.dy * s[ s2v.y ], s2v.Z + s2v.dz * s[ s2v.z ]];
          var index = v[0] + v[ 1 ] * me.mri.dim[0] + v[ 2 ] * me.mri.dim[0] * me.mri.dim[ 1 ];
          return index;
        },

      drawScreenSpace: function drawScreenSpace() {
          var x, y, i;
          var ys, ya, yc;
          var val;
          var s, s2v = me.mri.s2v;
          var c, sz = me.mri.dim[0] * me.mri.dim[ 1 ] * me.mri.dim[ 2 ];

          ys = me.slice;
          yc = me.slice;
          ya = me.slice;
          for (y = 0; y < me.H; y++) {
            for (x = 0; x < me.W; x++) {
              switch (me.view) {
              case 'sag': s = [ys, x, me.H - 1 - y]; break;
              case 'cor': s = [x, yc, me.H - 1 - y]; break;
              case 'axi': s = [x, me.H - 1 - y, ya]; break;
            }
              i = me.S2I(s);

              // Draw 1d (anatomy) and 3d (colour dti) voxels
              if (me.mri.datadim == 3) {
                c = [
                    255 * me.mri.data[ i ] / me.maxValue,
                    255 * me.mri.data[ i + sz ] / me.maxValue,
                    255 * me.mri.data[ i + 2 * sz ] / me.maxValue,
                    255,
                ];
              } else {
                val = 255 * me.mri.data[ i ] / me.maxValue;
                c = [val, val, val, 255];
              }

              i = (y * me.offCanvas.width + x) * 4;
              me.offPixelBuffer.data[ i ]  = c[0];
              me.offPixelBuffer.data[ i + 1 ] = c[ 1 ];
              me.offPixelBuffer.data[ i + 2 ] = c[ 2 ];
              me.offPixelBuffer.data[ i + 3 ] = c[ 3 ];
            }
          }

          me.offContext.putImageData(me.offPixelBuffer, 0, 0);
          me.context.drawImage(me.offCanvas, 0, 0, me.W, me.H * me.Hdim / me.Wdim);
        },

      setView: function setView(view, doDrawFlag) {
          var N = me.elem.getElementsByClassName('N')[0],
              L = me.elem.getElementsByClassName('L')[0],
              R = me.elem.getElementsByClassName('R')[0],
              S = me.elem.getElementsByClassName('S')[0],
              I = me.elem.getElementsByClassName('I')[0];

          me.view = view;

          if (doDrawFlag == undefined) {
            doDrawFlag = true;
          }

          // Configure view dimensions
          switch (me.space) {
          case 'voxel':
            var dim = me.mri.dim,
                pixdim = me.mri.pixdim;
          break;
          case 'world':
            var dim = me.mri.s2v.sdim,
                pixdim = me.mri.s2v.wpixdim;
          break;
        }
          switch (me.view) {
          case 'sag':	[ me.W, me.H, me.D, me.Wdim, me.Hdim ] = [dim[ 1 ], dim[ 2 ], dim[0], pixdim[ 1 ], pixdim[ 2 ]]; break; // Sagital: X
          case 'cor':	[ me.W, me.H, me.D, me.Wdim, me.Hdim ] = [dim[0], dim[ 2 ], dim[ 1 ], pixdim[0], pixdim[ 2 ]]; break; // Coronal: Y
          case 'axi':	[ me.W, me.H, me.D, me.Wdim, me.Hdim ] = [dim[0], dim[ 1 ], dim[ 2 ], pixdim[0], pixdim[ 1 ]]; break; // Axial: Z
        }
          me.maxSlice = me.D - 1;
          me.slice = parseInt(me.D / 2);

          // Configure view information
          switch (me.space) {
          case 'voxel':
            switch (me.view) {
            case 'sag':
              N.innerHTML = 'I: ' + me.slice;
              L.innerHTML = '-J';
              R.innerHTML = '+J';
              S.innerHTML = '+K';
              I.innerHTML = '-K';
            break;
            case 'cor':
              N.innerHTML = 'J: ' + me.slice;
              L.innerHTML = '-I';
              R.innerHTML = '+I';
              S.innerHTML = '+K';
              I.innerHTML = '-K';
            break;
            case 'axi':
              N.innerHTML = 'K: ' + me.slice;
              L.innerHTML = '-I';
              R.innerHTML = '+I';
              S.innerHTML = '+J';
              I.innerHTML = '-J';
            break;
          }
          break;
          case 'world':
            switch (me.view) {
            case 'sag':
              N.innerHTML = 'LR: ' + me.slice;
              L.innerHTML = 'P';
              R.innerHTML = 'A';
              S.innerHTML = 'S';
              I.innerHTML = 'I';
            break;
            case 'cor':
              N.innerHTML = 'PA: ' + me.slice;
              L.innerHTML = 'L';
              R.innerHTML = 'R';
              S.innerHTML = 'S';
              I.innerHTML = 'I';
            break;
            case 'axi':
              N.innerHTML = 'IS: ' + me.slice;
              L.innerHTML = 'L';
              R.innerHTML = 'R';
              S.innerHTML = 'A';
              I.innerHTML = 'P';
            break;
          }
          break;
        }

          me.canvas.width = me.W;
          me.canvas.height = me.H * me.Hdim / me.Wdim;
          me.offCanvas.width = me.W;
          me.offCanvas.height = me.H;
          me.offPixelBuffer = me.offContext.getImageData(0, 0, me.offCanvas.width, me.offCanvas.height);

          if (doDrawFlag == true)
              me.draw();
        },

      setSpace: function setSpace(space) {
          me.space = space;
          me.draw();
        },

      setSlice: function setSlice(sliceNumber) {
          var maxSlice;

          // Check that sliceNumber is not <0
          if (sliceNumber < 0)
              sliceNumber = 0;

          // Check that sliceNumber is not > maximum
          if (sliceNumber > me.maxSlice)
              sliceNumber = me.maxSlice;

          me.slice = sliceNumber;
          me.draw();

          // Draw information
          var N = me.elem.getElementsByClassName('N')[0];
          switch (me.space) {
          case 'voxel':
            switch (me.view) {
            case 'sag':
              N.innerHTML = 'I: ' + me.slice;
            break;
            case 'cor':
              N.innerHTML = 'J: ' + me.slice;
            break;
            case 'axi':
              N.innerHTML = 'K: ' + me.slice;
            break;
          }
          break;
          case 'world':
            switch (me.view) {
            case 'sag':
              N.innerHTML = 'LR: ' + me.slice;
            break;
            case 'cor':
              N.innerHTML = 'PA: ' + me.slice;
            break;
            case 'axi':
              N.innerHTML = 'IS: ' + me.slice;
            break;
          }
          break;
        }
        },

      nextSlice: function nextSlice() {
          me.setSlice(me.slice + 1);
        },

      previousSlice: function previousSlice() {
          me.setSlice(me.slice - 1);
        },
    };

  // Check params
  if (!myParams.mriPath) {
    console.error('No MRI path');
    return;
  }

  if (!myParams.elem) {
    console.error('No elem');
    return;
  }

  // Set params
  me.mriPath = myParams.mriPath;
  me.elem = myParams.elem;

  return me;
}
