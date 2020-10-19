'use strict';

function MRIViewer(myParams) {
  var me = {
    mriPath: null,          // Path to mri
    //mrijs_url: 'http://localhost/mrijs/mri.js',
    // mrijs_url: '/lib/mrijs/mri.js',
    mrijs_url: 'https://cdn.jsdelivr.net/gh/neuroanatomy/mrijs@0.0.5/mri.js',
    mri: null,              // Mri data
    views: [],              // views on the data
    space: null,            // Space: voxel, world or absolute
    dimensions: null,       // Object containing dimension info for all spaces and views

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
        };
        s.onerror = function () {
          console.error('ERROR');
          reject();
        };

        document.body.appendChild(s);
      });

      return pr;
    },

    init: function init() {
      var pr = new Promise(function (resolve, reject) {
        me.loadScript(me.mrijs_url, function () {
          return window.MRI !== undefined;
        })
          .then(function () {
            resolve();
          });
      });

      return pr;
    },

    configure: function configure(updateProgress) {
    // Display loading message
      for(const view of me.views) {
        view.innerHTML = '<b>Loading...</b>';
      }

      var pr = new Promise((resolve, reject) => {
      // Load MRI
        me.mri = new MRI();
        me.mri.init()
          .then(() => {
            if(me.mriPath) {
              me.mri.fileName = me.mriPath;
              return me.mri.loadMRIFromPath(me.mriPath, updateProgress);
            } else if(me.mriFile) {
              me.mri.fileName = me.mriFile.name;
              return me.mri.loadMRIFromFile(me.mriFile);
            }
            reject(new Error("No data to load"));
          })
          .then(() => {
            let arr, i;

            // configure dimensions
            me.configureDimensions();

            // Set default space
            if(!me.space) {
              me.space = 'absolute';
            }

            // Set view defaults
            for(const view of me.views) {
              me.makeGUI(view);
              if(view.addPlaneSelect) {
                me.addPlaneSelectUI(view);
              }
              if(view.addSpaceSelect) {
                me.addSpaceSelectUI(view);
              }
              [view.canvas] = view.elem.getElementsByTagName('canvas');
              [view.slider] = view.elem.getElementsByClassName('slice');
              view.maxSlice = me.dimensions[me.space][view.plane].D - 1;

              // Create view's offscreen canvas, and get their contexts
              view.offCanvas = document.createElement('canvas');
              view.offContext = view.offCanvas.getContext('2d');
            }

            // configure canvas size based on volume dimensions and space
            me.configureCanvasSize();

            // configure slice sliders
            me.configureSliders();

            // Configure information
            for(const view of me.views) {
              me.configureInformation(view);
            }

            // Set maximum display grey level to 99.99% quantile
            arr = [];
            const step = Math.max(1, Math.floor(me.mri.data.length / 10000));
            for (i = 0; i < me.mri.data.length; i += step) {
              arr.push(me.mri.data[i]);
            }
            arr = arr.sort(function (a, b) { return a - b; });
            me.maxValue = arr[arr.length-1];

            // Draw
            me.draw();
            me.info();

            // Resolve
            resolve();
          });
      });

      return pr;
    },

    configureDimensions: function configureDimensions() {
      let space;
      const spaces = ['voxel', 'world', 'absolute'];
      let dimensions = {};
      const {sdim, wpixdim} = me.mri.s2v;
      const medpix = wpixdim.sort()[1]; // maxpix = Math.max(...me.mri.s2v.wpixdim);
      let max = Math.round(1.3 * Math.max(...sdim.map((v, i) => v*wpixdim[i]/medpix)));

      dimensions = {
        voxel: {
          dim: me.mri.dim,
          pixdim: me.mri.pixdim
        },
        world: {
          dim: me.mri.s2v.sdim,
          pixdim: me.mri.s2v.wpixdim
        },
        absolute: {
          dim: [max, max, max],
          pixdim: [medpix, medpix, medpix] // [maxpix, maxpix, maxpix] // me.mri.s2v.wpixdim
        }
      };

      for(space of spaces) {
        const {dim, pixdim} = dimensions[space];
        dimensions[space].sag = { W: dim[1], H: dim[2], D: dim[0], Wdim: pixdim[1], Hdim: pixdim[2] };
        dimensions[space].cor = { W: dim[0], H: dim[2], D: dim[1], Wdim: pixdim[0], Hdim: pixdim[2] };
        dimensions[space].axi = { W: dim[0], H: dim[1], D: dim[2], Wdim: pixdim[0], Hdim: pixdim[1] };
      }
      me.dimensions = dimensions;
    },

    /**
    * @desc Configure canvas size for all views based on volume dimensions and
    *   display space. Also, set the slice sliders to their default position
    * @returns {void}
    */
    configureCanvasSize: function configureCanvasSize() {
      let view;
      // Set canvas size and default slices (mid-volume)
      for(view of me.views) {
        const {W, H, Wdim, Hdim} = me.dimensions[me.space][view.plane];
        view.canvas.width = W;
        view.canvas.height = H * Hdim / Wdim;
      }
    },

    /**
    * @desc Configure slice sliders to their default position for all views
    * @returns {void}
    */
    configureSliders: function configureSliders() {
      let view;
      // Set canvas size and default slices (mid-volume)
      for(view of me.views) {
        //const {W, H, D, Wdim, Hdim} = me.dimensions[me.space][view.plane];
        const {D} = me.dimensions[me.space][view.plane];
        view.slice = Math.floor(D/2);
        view.slider.max = view.maxSlice;
        view.slider.value = view.slice;
        console.log("plane:", view.plane, "max slice:", view.slider.max, "actual slice:", view.slider.value);
      }
    },

    configureInformation: function configureInformation(view) {
      const [N, L, R, S, I] = [
        view.elem.querySelector('.N'),
        view.elem.querySelector('.L'),
        view.elem.querySelector('.R'),
        view.elem.querySelector('.S'),
        view.elem.querySelector('.I')
      ];

      // Configure plane information
      switch (me.space) {
        case 'voxel':
          switch (view.plane) {
            case 'sag':
              N.innerHTML = 'I: ' + view.slice;
              L.innerHTML = '-J';
              R.innerHTML = '+J';
              S.innerHTML = '+K';
              I.innerHTML = '-K';
              break;
            case 'cor':
              N.innerHTML = 'J: ' + view.slice;
              L.innerHTML = '-I';
              R.innerHTML = '+I';
              S.innerHTML = '+K';
              I.innerHTML = '-K';
              break;
            case 'axi':
              N.innerHTML = 'K: ' + view.slice;
              L.innerHTML = '-I';
              R.innerHTML = '+I';
              S.innerHTML = '+J';
              I.innerHTML = '-J';
              break;
          }
          break;
        case 'world':
          switch (view.plane) {
            case 'sag':
              N.innerHTML = 'LR: ' + view.slice;
              L.innerHTML = 'P';
              R.innerHTML = 'A';
              S.innerHTML = 'S';
              I.innerHTML = 'I';
              break;
            case 'cor':
              N.innerHTML = 'PA: ' + view.slice;
              L.innerHTML = 'L';
              R.innerHTML = 'R';
              S.innerHTML = 'S';
              I.innerHTML = 'I';
              break;
            case 'axi':
              N.innerHTML = 'IS: ' + view.slice;
              L.innerHTML = 'L';
              R.innerHTML = 'R';
              S.innerHTML = 'A';
              I.innerHTML = 'P';
              break;
          }
          break;
        case 'absolute':
          switch (view.plane) {
            case 'sag':
              N.innerHTML = 'LR: ' + view.slice;
              L.innerHTML = 'P';
              R.innerHTML = 'A';
              S.innerHTML = 'S';
              I.innerHTML = 'I';
              break;
            case 'cor':
              N.innerHTML = 'PA: ' + view.slice;
              L.innerHTML = 'L';
              R.innerHTML = 'R';
              S.innerHTML = 'S';
              I.innerHTML = 'I';
              break;
            case 'axi':
              N.innerHTML = 'IS: ' + view.slice;
              L.innerHTML = 'L';
              R.innerHTML = 'R';
              S.innerHTML = 'A';
              I.innerHTML = 'P';
              break;
          }
          break;
      }
    },

    makeGUI: function makeGUI(view) {
    // Append and connect user interface
      view.elem.style.display = 'inline-block';
      view.elem.style.position = 'relative';
      view.elem.innerHTML = [
        '<div class="wrap" style="position:relative;display:inline-block">',
        '<canvas class="viewer" style="width:512px;background:#2c4d7c;image-rendering:pixelated"></canvas>',
        '<div class="info" style="position:absolute;top:0;left:0;width:100%;height:100%;color:white;pointer-events:none;user-select: none">',
        '<b class="N" style="position:absolute;top:0;left:0"></b>',
        '<b class="L" style="position:absolute;top:50%;left:0;color:white"></b>',
        '<b class="R" style="position:absolute;top:50%;right:0"></b>',
        '<b class="S" style="position:absolute;top:0;left:50%"></b>',
        '<b class="I" style="position:absolute;bottom:0%;left:50%"></b>',
        '</div>',
        '</div>',
        '<br />',
        '<input class="slice" type="range" step="any" style="width:100%"></input>',
        '<br />'
      ].join('\n');
      var [slice] = view.elem.getElementsByClassName('slice');
      slice.addEventListener('input', function () { me.setSlice(view, Math.floor(this.value)); });
    },

    addPlaneSelectUI: function addPlaneSelectUI(view) {
      view.elem.insertAdjacentHTML('beforeend', [
        '<button class="sag-btn">Sagittal</button>',
        '<button class="axi-btn">Axial</button>',
        '<button class="cor-btn">Coronal</button>'
      ].join('\n'));
      var [sagBtn] = view.elem.getElementsByClassName('sag-btn');
      var [axiBtn] = view.elem.getElementsByClassName('axi-btn');
      var [corBtn] = view.elem.getElementsByClassName('cor-btn');
      sagBtn.addEventListener('click', function () {
        me.setPlane(view, 'sag');
        //view.slider.max = me.dimensions[me.space].sag.maxSlice;
        me.configureSliders();
      });
      axiBtn.addEventListener('click', function () {
        me.setPlane(view, 'axi');
        //view.slider.max = me.dimensions[me.space].axi.maxSlice;
        me.configureSliders();
      });
      corBtn.addEventListener('click', function () {
        me.setPlane(view, 'cor');
        //view.slider.max = me.dimensions[me.space].cor.maxSlice;
        me.configureSliders();
      });
    },

    addSpaceSelectUI: function addSpaceSelectUI(view) {
      view.elem.insertAdjacentHTML('beforeend', [
        '<select class="spa-btn">',
        '<option value="absolute">Absolute</option>',
        '<option value="world">World</option>',
        '<option value="voxel">Voxel</option>',
        '</select>'
      ].join('\n'));
      var [spaBtn] = view.elem.getElementsByClassName('spa-btn');
      spaBtn.addEventListener('change', function () {
        me.setSpace(this.value);
      });
    },

    display: async function display(updateProgress) {
      await me.init();
      await me.configure(updateProgress);
    },

    draw: function draw() {
      let view;
      for(view of me.views) {
        let imgData;
        switch (me.space) {
          case 'voxel':
            me.drawVoxelSpace(view);
            break;
          case 'world':
            me.drawScreenSpace(view);
            break;
          case 'absolute':
            me.drawAbsoluteSpace(view);
            break;
        }

        /*
        let ctx = view.canvas.getContext("2d");
        let image = new Image();
        image.onload = function(){
          ctx.drawImage(image, 0, 0);
        };
        image.src = imgData;
*/
      }
    },

    drawVoxelSpace: function drawVoxelSpace(view) {
      const {plane, slice} = view;
      const {dim} = me.mri;
      const {W, H} = me.dimensions.voxel[plane];
      let c, i, s, val;
      let x, y;

      // Check if offscreen canvas size needs to be updated
      if( view.offCanvas.width !== W || view.offCanvas.height !== H) {
        view.offCanvas.width = W;
        view.offCanvas.height = H;
        view.offPixelBuffer = view.offContext.getImageData(0, 0, W, H);
      }

      for (y = 0; y < H; y++) {
        for (x = 0; x < W; x++) {
          switch (plane) {
            case 'sag': s = [slice, x, H - 1 - y]; break;
            case 'cor': s = [x, slice, H - 1 - y]; break;
            case 'axi': s = [x, H - 1 - y, slice]; break;
          }
          if(s[0]>=0 && s[0]<dim[0] && s[1]>=0 && s[1]<dim[1] && s[2]>=0 && s[2]<dim[2]) {
            i = s[2] * dim[1] * dim[0] + s[1] * dim[0] + s[0];
            // Draw 1d (anatomy) and 3d (colour dti) voxels
            if (me.mri.datadim === 3) {
              c = [
                255 * me.mri.data[i] / me.maxValue,
                255 * me.mri.data[i + sz] / me.maxValue,
                255 * me.mri.data[i + 2 * sz] / me.maxValue,
                255
              ];
            } else {
              val = 255 * me.mri.data[i] / me.maxValue;
              c = [val, val, val, 255];
            }
          } else {
            c = [0, 0, 255, 255];
          }

          i = (y * view.offCanvas.width + x) * 4;
          view.offPixelBuffer.data[i] = c[0];
          view.offPixelBuffer.data[i + 1] = c[1];
          view.offPixelBuffer.data[i + 2] = c[2];
          view.offPixelBuffer.data[i + 3] = c[3];
        }
      }
      const ctx = view.canvas.getContext("2d");
      ctx.putImageData(view.offPixelBuffer, 0, 0);

      /*
      view.offContext.putImageData(view.offPixelBuffer, 0, 0);
      let imageData = me.offCanvas.toDataURL();

      return imageData;
*/
    },

    /**
    * @func S2I
    * @description Convert screen coordinates to voxel index
    * @param {array} s Screen coordinates x, y and slice
    * @return {number} The voxel index, from 0 to the total dim0*dim1*dim2-1
    */
    S2I: function S2I(s) {
      var {s2v} = me.mri;
      var v = [s2v.X + s2v.dx * s[s2v.x], s2v.Y + s2v.dy * s[s2v.y], s2v.Z + s2v.dz * s[s2v.z]];
      var index = v[0] + v[1] * me.mri.dim[0] + v[2] * me.mri.dim[0] * me.mri.dim[1];

      return index|0;
    },

    /**
    * @func S2IJK
    * @description Convert screen coordinates to voxel coordinates
    * @param {array} s Screen coordinates x, y and slice
    * @return {array} The voxel coordinates [i, j, k], 0<=j<i<dim0, 0<=k<dim2
    */
    S2IJK: function S2IJK(s) {
      var {s2v} = me.mri;
      var v = [s2v.X + s2v.dx * s[s2v.x], s2v.Y + s2v.dy * s[s2v.y], s2v.Z + s2v.dz * s[s2v.z]];

      return [v[0]|0, v[1]|0, v[2]|0];
    },

    /**
    * @func IJK2S
    * @description Convert voxel coordinates to screen coordinates
    * @param {array} ijk Voxel coordinates i, j and k
    * @return {array} The screen coordinates [x, y, slice]
    */
    IJK2S: function IJK2S(ijk) {
      var {s2v} = me.mri;
      var s = [];
      s[s2v.x] = (ijk[0] - s2v.X)/s2v.dx;
      s[s2v.y] = (ijk[1] - s2v.Y)/s2v.dy;
      s[s2v.z] = (ijk[2] - s2v.Z)/s2v.dz;

      return [s[0]|0, s[1]|0, s[2]|0];
    },

    drawScreenSpace: function drawScreenSpace(view) {
      const {plane, slice} = view;
      var i, x, y;
      var val;
      const {W, H} = me.dimensions.world[plane];
      var s, s2v = me.mri.s2v;
      var c, sz = me.mri.dim[0] * me.mri.dim[1] * me.mri.dim[2];

      // Check if offscreen canvas size needs to be updated
      if( view.offCanvas.width !== W || view.offCanvas.height !== H) {
        view.offCanvas.width = W;
        view.offCanvas.height = H;
        view.offPixelBuffer = view.offContext.getImageData(0, 0, W, H);
      }

      for (y = 0; y < H; y++) {
        for (x = 0; x < W; x++) {
          switch (plane) {
            case 'sag': s = [slice, x, H - 1 - y]; break;
            case 'cor': s = [x, slice, H - 1 - y]; break;
            case 'axi': s = [x, H - 1 - y, slice]; break;
          }
          i = me.S2I(s);
          if(i) {
          // Draw 1d (anatomy) and 3d (colour dti) voxels
            if (me.mri.datadim === 3) {
              c = [
                255 * me.mri.data[i] / me.maxValue,
                255 * me.mri.data[i + sz] / me.maxValue,
                255 * me.mri.data[i + 2 * sz] / me.maxValue,
                255
              ];
            } else {
              val = 255 * me.mri.data[i] / me.maxValue;
              c = [val, val, val, 255];
            }
          } else {
            c = [0, 255, 0, 255];
          }

          i = (y * view.offCanvas.width + x) * 4;
          view.offPixelBuffer.data[i] = c[0];
          view.offPixelBuffer.data[i + 1] = c[1];
          view.offPixelBuffer.data[i + 2] = c[2];
          view.offPixelBuffer.data[i + 3] = c[3];
        }
      }
      const ctx = view.canvas.getContext("2d");
      ctx.putImageData(view.offPixelBuffer, 0, 0);

      /*
      view.offContext.putImageData(view.offPixelBuffer, 0, 0);
      let imageData = me.offCanvas.toDataURL();

      return imageData;
      */
    },

    /**
     * @func trilinear
    * @desc Code from http://paulbourke.net/miscellaneous/interpolation/
    */
    trilinear: function trilinear(x, y, z) {
      const {dim, data} = me.mri;
      let [i, j, k] = [Math.floor(x), Math.floor(y), Math.floor(z)];
      const V000 = (data[ k   *dim[1]*dim[0] +  j   *dim[0] +  i]) | 0;
      const V100 = (data[ k   *dim[1]*dim[0] +  j   *dim[0] + (i+1)]) | 0;
      const V010 = (data[ k   *dim[1]*dim[0] + (j+1)*dim[0] +  i]) | 0;
      const V001 = (data[(k+1)*dim[1]*dim[0] +  j   *dim[0] +  i]) | 0;
      const V101 = (data[(k+1)*dim[1]*dim[0] +  j   *dim[0] + (i+1)]) | 0;
      const V011 = (data[(k+1)*dim[1]*dim[0] + (j+1)*dim[0] +  i]) | 0;
      const V110 = (data[ k   *dim[1]*dim[0] + (j+1)*dim[0] + (i+1)]) | 0;
      const V111 = (data[(k+1)*dim[1]*dim[0] + (j+1)*dim[0] + (i+1)]) | 0;

      x = x - i;
      y = y - j;
      z = z - k;

      const Vxyz =
        V000 * (1 - x)*(1 - y)*(1 - z) +
        V100 * x * (1 - y) * (1 - z) +
        V010 * (1 - x) * y * (1 - z) +
        V001 * (1 - x) * (1 - y) * z +
        V101 * x * (1 - y) * z +
        V011 * (1 - x) * y * z +
        V110 * x * y * (1 - z) +
        V111 * x * y * z;

      return Vxyz;
    },

    /**
    * @func A2Value
    * @desc Returns the trilinearly interpolated value at an absolute space coordinate
    */
    A2Value: function A2Value(a) {
      const v = me.mri.multMatVec(me.mri.MatrixMm2Vox, a);
      const {dim} = me.mri;
      const [x, y, z] = [Math.floor(v[0]), Math.floor(v[1]), Math.floor(v[2])];
      if(x<0 || x>=dim[0] || y<0 || y>=dim[1] || z<0 || z>=dim[2]) {
        return 0;
      }

      return me.trilinear(v[0], v[1], v[2]);
    },

    /**
    * @func A2I
    * @desc Compute the voxel index corresponding to an absolute space coordinate
    * @param {number} a Coordinate in absolute space
    * @returns {number} i Voxel index for that absolute spacecoordinate
    */
    A2I: function A2I(a) {
      const v = me.mri.multMatVec(me.mri.MatrixMm2Vox, a);
      const {dim} = me.mri;
      const [x, y, z] = [Math.floor(v[0]), Math.floor(v[1]), Math.floor(v[2])];
      if(x<0 || x>=dim[0] || y<0 || y>=dim[1] || z<0 || z>=dim[2]) {
        return;
      }
      const i = z*dim[1]*dim[0] + y*dim[0] + x;

      return i;
    },

    drawAbsoluteSpace: function drawAbsoluteSpace(view) {
      const {plane, slice} = view;
      var i, x, y;
      var val;
      const {W, H, D, Wdim: pix} = me.dimensions.absolute[plane];
      var a;
      var c, sz = me.mri.dim[0] * me.mri.dim[1] * me.mri.dim[2];
      const opacity = 0.3;

      // Check if offscreen canvas size needs to be updated
      if( view.offCanvas.width !== W || view.offCanvas.height !== H) {
        view.offCanvas.width = W;
        view.offCanvas.height = H;
        view.offPixelBuffer = view.offContext.getImageData(0, 0, W, H);
      }

      for (y = 0; y < H; y++) {
        for (x = 0; x < W; x++) {
          switch (plane) {
            case 'sag': a = [(slice - Math.floor(D/2)), (x - Math.floor(W/2)), (Math.floor(H/2 - 0.5) - y)]; break;
            case 'cor': a = [(x - Math.floor(W/2)), (slice - Math.floor(D/2)), (Math.floor(H/2 - 0.5) - y)]; break;
            case 'axi': a = [(x - Math.floor(W/2)), (Math.floor(H/2 - 0.5) - y), (slice - Math.floor(D/2))]; break;
          }
          a[0]*=pix;
          a[1]*=pix;
          a[2]*=pix;
          i = me.A2I(a);
          if(typeof i !== "undefined") {
          // Draw 1d (anatomy) and 3d (colour dti) voxels
            if (me.mri.datadim === 3) {
              c = [
                255 * me.mri.data[i] / me.maxValue,
                255 * me.mri.data[i + sz] / me.maxValue,
                255 * me.mri.data[i + 2 * sz] / me.maxValue,
                255
              ];
            } else {
              // val = 255 * me.mri.data[i] / me.maxValue;
              val = 255 * me.A2Value(a) / me.maxValue;
              c = [val, val, val, 255];
            }
          } else {
            c = [0, 0, 0, 100];
          }

          // plot 0 axes
          if( y === Math.floor(H/2 - 0.5) || x === Math.floor(W/2)) {
            c = [
              (1-opacity)*c[0] + opacity*44*2,
              (1-opacity)*c[1] + opacity*77*2,
              (1-opacity)*c[2] + opacity*124*2,
              c[3]
            ];
          }

          i = (y * view.offCanvas.width + x) * 4;
          view.offPixelBuffer.data[i] = c[0];
          view.offPixelBuffer.data[i + 1] = c[1];
          view.offPixelBuffer.data[i + 2] = c[2];
          view.offPixelBuffer.data[i + 3] = c[3];
        }
      }

      const ctx = view.canvas.getContext("2d");
      ctx.putImageData(view.offPixelBuffer, 0, 0);
    },

    /**
    * @func setPlane
    * @desc Set view's plane to sag, cor or axi, configures orientation information display,
    *   configures onscreen canvas size
    */
    setPlane: function setPlane(view, plane, doDrawFlag) {
      view.plane = plane;

      if (doDrawFlag === undefined) {
        doDrawFlag = true;
      }

      view.maxSlice = me.dimensions[me.space][plane].D - 1;

      const {W, H, D, Wdim, Hdim} = me.dimensions[me.space][plane];
      view.slice = Math.floor((D - 1)/2);
      view.slider.max = view.maxSlice;
      view.slider.value = view.slice;
      view.canvas.width = W;
      view.canvas.height = H * Hdim / Wdim;

      me.configureInformation(view);

      if (doDrawFlag === true) {
        me.draw();
      }
    },

    /**
     * @func setSpace
    * @desc Changes the space in which the data is displayed, updates the image and
    *   information
    * @param {string} space Space string: voxel, world or absolute
    * @returns {void}
    */
    setSpace: function setSpace(space) {
      let view;
      me.space = space;
      me.configureCanvasSize();
      me.configureSliders();
      me.draw();
      for(view of me.views) {
        me.configureInformation(view);
      }
    },

    /**
     * @func setSlice
    * @desc Sets the slice displayed in the specified viewer
    * @param {object} view View object
    * @param {number} slice Slice number
    * @returns {void}
    */
    setSlice: function setSlice(view, slice) {
      let [slider] = view.elem.getElementsByClassName('slice');
      var maxSlice;

      // Check that slice number is within the interval [0, max)
      if (slice < 0) {
        slice = 0;
      }
      if (slice > view.maxSlice) {
        slice = view.maxSlice;
      }

      view.slice = slice;
      me.draw();
      me.info();
    },

    info: function info() {
      let view;
      for(view of me.views) {
        me.info1(view);
      }
    },

    info1: function info1(view) {
      const [N] = view.elem.getElementsByClassName('N');
      switch (me.space) {
        case 'voxel':
          switch (view.plane) {
            case 'sag':
              N.innerHTML = 'I: ' + view.slice;
              break;
            case 'cor':
              N.innerHTML = 'J: ' + view.slice;
              break;
            case 'axi':
              N.innerHTML = 'K: ' + view.slice;
              break;
          }
          break;
        case 'world':
          switch (view.plane) {
            case 'sag':
              N.innerHTML = 'LR: ' + view.slice;
              break;
            case 'cor':
              N.innerHTML = 'PA: ' + view.slice;
              break;
            case 'axi':
              N.innerHTML = 'IS: ' + view.slice;
              break;
          }
          break;
        case 'absolute':
          let {D} = me.dimensions.absolute[view.plane];
          switch (view.plane) {
            case 'sag':
              N.innerHTML = 'LR: ' + (view.slice - Math.floor(D/2));
              break;
            case 'cor':
              N.innerHTML = 'PA: ' + (view.slice - Math.floor(D/2));
              break;
            case 'axi':
              N.innerHTML = 'IS: ' + (view.slice - Math.floor(D/2));
              break;
          }
          break;
      }
    },

    nextSlice: function nextSlice(view) {
      me.setSlice(view, view.slice + 1);
    },

    previousSlice: function previousSlice(view) {
      me.setSlice(view, view.slice - 1);
    }
  };

  // Check params
  if(!myParams.mriPath && !myParams.mriFile) {
    console.error('No MRI path nor MRI file');

    return;
  }

  if(!myParams.views) {
    console.error('No views');

    return;
  }

  // Set params
  me.mriPath = myParams.mriPath;
  me.mriFile = myParams.mriFile;
  me.views = myParams.views;
  if(myParams.space) {
    me.space = myParams.space;
  }

  return me;
}
