'use strict';

function MRIViewer(myParams) {
    var me = {
        mriPath: null,          // Path to mri
        mrijs_url: 'http://localhost/mrijs/mri.js',
        // mrijs_url: 'https://rawgit.com/r03ert0/mrijs/master/mri.js',
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
                .then(function () {
                    resolve();
                });
            });

            return pr;
        },

        configure: function configure(updateProgress) {
            // Display loading message
            let view;
            for(view of me.views) {
                view.innerHTML = '<b>Loading...</b>';
            }

            var pr = new Promise((resolve, reject) => {
                // Load MRI
                me.mri = new MRI();
                me.mri.init()
                .then(() => {
                    if(me.mriPath) {
                        return me.mri.loadMRIFromPath(me.mriPath, updateProgress);
                    } else if(me.mriFile) {
                        return me.mri.loadMRIFromFile(me.mriFile);
                    } else {
                        reject("No data to load");
                    }
                })
                .then(() => {
                    let slice, i, arr;
                    let view;

                    // configure dimensions
                    me.configureDimensions();

                    // Set default space
                    me.space = 'absolute';

                    // Set view defaults
                    for(view of me.views) {
                        me.makeGUI(view);
                        if(view.addPlaneSelect) {
                            me.addPlaneSelectUI(view);
                        }
                        if(view.addSpaceSelect) {
                            me.addSpaceSelectUI(view);
                        }
                        view.canvas = view.elem.getElementsByTagName('canvas')[0];
                        view.slider = view.elem.getElementsByClassName('slice')[0];
                        view.maxSlice = me.dimensions[me.space][view.plane].D - 1;

                        // Create view's offscreen canvas, and get their contexts
                        view.offCanvas = document.createElement('canvas'),
                        view.offContext = view.offCanvas.getContext('2d');
                    }

                    // configure canvas size based on volume dimensions and space
                    me.configureCanvasSize();
                    
                    // configure slice sliders
                    me.configureSliders();

                    // Configure information
                    for(view of me.views) {
                        me.configureInformation(view);
                    }

                    // Set maximum display grey level to 99.99% quantile
                    arr = [];
                    for (i = 0; i < me.mri.data.length; i += parseInt(me.mri.data.length / 10000)) {
                      arr.push(me.mri.data[i]);
                    }
                    arr = arr.sort(function (a, b) { return a - b;});
                    me.maxValue = arr[9999];

                    // Draw
                    me.draw();

                    // Resolve
                    resolve();
                });
            });

            return pr;
        },

        configureDimensions: function configureDimensions() {
            let dim, pixdim;
            let space, spaces = ['voxel', 'world', 'absolute'];
            let view, views = ['sag', 'cor', 'axi'];
            let dimensions = {};
            let maxpix = Math.max(...me.mri.s2v.wpixdim);
            let max = Math.round(1.5 * Math.max(...me.mri.s2v.sdim.map((o)=>o*maxpix)));

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
                    pixdim: me.mri.s2v.wpixdim
                }
            };

            for(space of spaces) {
                for(view of views) {
                    dim = dimensions[space].dim;
                    pixdim = dimensions[space].pixdim;
                    dimensions[space].sag = { W: dim[1], H: dim[2], D: dim[0], Wdim: pixdim[1], Hdim: pixdim[2] };
                    dimensions[space].cor = { W: dim[0], H: dim[2], D: dim[1], Wdim: pixdim[0], Hdim: pixdim[2] };
                    dimensions[space].axi = { W: dim[0], H: dim[1], D: dim[2], Wdim: pixdim[0], Hdim: pixdim[1] };
                }
            }
            me.dimensions = dimensions;
        },

        /**
          * @desc Configure canvas size for all views based on volume dimensions and
          *       display space. Also, set the slice sliders to their default position
          */
        configureCanvasSize: function configureCanvasSize() {
            let view;
            // Set canvas size and default slices (mid-volume)
            for(view of me.views) {
                const {W, H, D, Wdim, Hdim} = me.dimensions[me.space][view.plane];
                view.canvas.width = W;
                view.canvas.height = H * Hdim / Wdim;
            }
        },

        /**
          * @desc Configure slice sliders to their default position for all views
          */
        configureSliders: function configureSliders() {
            let view;
            // Set canvas size and default slices (mid-volume)
            for(view of me.views) {
                const {W, H, D, Wdim, Hdim} = me.dimensions[me.space][view.plane];
                view.slice = parseInt((D - 1)/2);
                view.slider.max = view.maxSlice;
                view.slider.value = view.slice;
            }
        },

        configureInformation: function configureInformation(view) {
            var N = view.elem.getElementsByClassName('N')[0],
                L = view.elem.getElementsByClassName('L')[0],
                R = view.elem.getElementsByClassName('R')[0],
                S = view.elem.getElementsByClassName('S')[0],
                I = view.elem.getElementsByClassName('I')[0];

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
                    '<canvas class="viewer" style="width:512px;background:grey"></canvas>',
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
                '<br />',
            ].join('\n');
            var slice = view.elem.getElementsByClassName('slice')[0];
            slice.addEventListener('input', function () {me.setSlice(view, parseInt(this.value));});
        },

        addPlaneSelectUI: function addPlaneSelectUI(view) {
            view.elem.insertAdjacentHTML('beforeend', [
                '<button class="sag-btn">Sagittal</button>',
                '<button class="axi-btn">Axial</button>',
                '<button class="cor-btn">Coronal</button>',
            ].join('\n'));
            var sagBtn = view.elem.getElementsByClassName('sag-btn')[0];
            var axiBtn = view.elem.getElementsByClassName('axi-btn')[0];
            var corBtn = view.elem.getElementsByClassName('cor-btn')[0];
            sagBtn.addEventListener('click', function () {
                me.setPlane(view, 'sag');
                view.slider.max = me.dimensions[me.space].sag.maxSlice;
            });
            axiBtn.addEventListener('click', function () {
                me.setPlane(view, 'axi');
                view.slider.max = me.dimensions[me.space].axi.maxSlice;
            });
            corBtn.addEventListener('click', function () {
                me.setPlane(view, 'cor');
                view.slider.max = me.dimensions[me.space].cor.maxSlice;
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
            var spaBtn = view.elem.getElementsByClassName('spa-btn')[0];
            spaBtn.addEventListener('change', function () {
                me.setSpace(this.value);
            });
        },

        display: function display(updateProgress) {
            return me.init().then(function () {
                return me.configure(updateProgress);
            });
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
            const dim = me.mri.dim;
            const {W, H, D, Wdim, Hdim} = me.dimensions.voxel[plane];
            let i, c, s, val;
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
                        case 'sag':s = [slice, x, H - 1 - y]; break;
                        case 'cor':s = [x, slice, H - 1 - y]; break;
                        case 'axi':s = [x, H - 1 - y, slice]; break;
                    }
                    if(s[0]>=0 && s[0]<dim[0] && s[1]>=0 && s[1]<dim[1] && s[2]>=0 && s[2]<dim[2]) {
                        i = s[ 2 ] * dim[ 1 ] * dim[0] + s[ 1 ] * dim[0] + s[ 0 ];
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
                    } else {
                        c = [0, 0, 255, 255];
                    }

                    i = (y * view.offCanvas.width + x) * 4;
                    view.offPixelBuffer.data[ i ]  = c[0];
                    view.offPixelBuffer.data[ i + 1 ] = c[ 1 ];
                    view.offPixelBuffer.data[ i + 2 ] = c[ 2 ];
                    view.offPixelBuffer.data[ i + 3 ] = c[ 3 ];
                }
            }
            let ctx = view.canvas.getContext("2d");
            ctx.putImageData(view.offPixelBuffer, 0, 0);
/*
            view.offContext.putImageData(view.offPixelBuffer, 0, 0);
            let imageData = me.offCanvas.toDataURL();

            return imageData;
*/
        },

        S2I: function S2I(s) {
          var s2v = me.mri.s2v;
          var v = [s2v.X + s2v.dx * s[ s2v.x ], s2v.Y + s2v.dy * s[ s2v.y ], s2v.Z + s2v.dz * s[ s2v.z ]];
          var index = v[0] + v[ 1 ] * me.mri.dim[0] + v[ 2 ] * me.mri.dim[0] * me.mri.dim[ 1 ];
          return index;
        },

        drawScreenSpace: function drawScreenSpace(view) {
            const {plane, slice} = view;
            var x, y, i;
            var val;
            const {W, H, D, Wdim, Hdim} = me.dimensions.world[plane];
            var s, s2v = me.mri.s2v;
            var c, sz = me.mri.dim[0] * me.mri.dim[ 1 ] * me.mri.dim[ 2 ];

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
                    } else {
                        c = [0, 255, 0, 255];
                    }

                    i = (y * view.offCanvas.width + x) * 4;
                    view.offPixelBuffer.data[ i ]  = c[0];
                    view.offPixelBuffer.data[ i + 1 ] = c[ 1 ];
                    view.offPixelBuffer.data[ i + 2 ] = c[ 2 ];
                    view.offPixelBuffer.data[ i + 3 ] = c[ 3 ];
                }
            }
            let ctx = view.canvas.getContext("2d");
            ctx.putImageData(view.offPixelBuffer, 0, 0);
/*
            view.offContext.putImageData(view.offPixelBuffer, 0, 0);
            let imageData = me.offCanvas.toDataURL();

            return imageData;
*/
        },

        /**
          * @desc Code from http://paulbourke.net/miscellaneous/interpolation/
          */
        trilinear: function trilinear(x, y, z) {
            const dim = me.mri.dim;
            const data = me.mri.data;
            let [i, j, k] = [parseInt(x), parseInt(y), parseInt(z)];
            const V000 = data[ k   *dim[1]*dim[0] +  j   *dim[0] +  i]   |0;
            const V100 = data[ k   *dim[1]*dim[0] +  j   *dim[0] + (i+1)]|0;
            const V010 = data[ k   *dim[1]*dim[0] + (j+1)*dim[0] +  i]   |0;
            const V001 = data[(k+1)*dim[1]*dim[0] +  j   *dim[0] +  i]   |0;
            const V101 = data[(k+1)*dim[1]*dim[0] +  j   *dim[0] + (i+1)]|0;
            const V011 = data[(k+1)*dim[1]*dim[0] + (j+1)*dim[0] +  i]   |0;
            const V110 = data[ k   *dim[1]*dim[0] + (j+1)*dim[0] + (i+1)]|0;
            const V111 = data[(k+1)*dim[1]*dim[0] + (j+1)*dim[0] + (i+1)]|0;

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

            return me.trilinear(v[0], v[1], v[2]);
        },

        /**
          * @func A2I
          * @desc Compute the voxel index corresponding to an absolute space coordinate
          */
        A2I: function A2I(a) {
            const v = me.mri.multMatVec(me.mri.MatrixMm2Vox, a);
            const dim = me.mri.dim;
            const [x, y, z] = [parseInt(v[0]), parseInt(v[1]), parseInt(v[2])];
            if(x<0 || x>=dim[0] || y<0 || y>=dim[1] || z<0 || z>=dim[2]) {
                return;
            }
            const i = z*dim[1]*dim[0] + y*dim[0] + x;

            return i;
        },

        drawAbsoluteSpace: function drawAbsoluteSpace(view) {
            let {plane, slice} = view;
            var x, y, i;
            var val;
            let {W, H, D, Wdim, Hdim} = me.dimensions.absolute[plane];
            var a, w2v = me.mri.mm2vox;
            var c, sz = me.mri.dim[0] * me.mri.dim[ 1 ] * me.mri.dim[ 2 ];

            // Check if offscreen canvas size needs to be updated
            if( view.offCanvas.width !== W || view.offCanvas.height !== H) {
                view.offCanvas.width = W;
                view.offCanvas.height = H;
                view.offPixelBuffer = view.offContext.getImageData(0, 0, W, H);
            }

            for (y = 0; y <= H; y++) {
                for (x = 0; x <= W; x++) {
                    switch (plane) {
                        case 'sag': a = [slice - parseInt(D/2), x - parseInt(W/2), parseInt(H/2) - 1 - y]; break;
                        case 'cor': a = [x - parseInt(W/2), slice - parseInt(D/2), parseInt(H/2) - 1 - y]; break;
                        case 'axi': a = [x - parseInt(W/2), parseInt(H/2) - 1 - y, slice - parseInt(D/2)]; break;
                    }
                    i = me.A2I(a);
                    if(i) {
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
                    } else {
                        c=[255,0,0,255];
                    }

                    if( y === parseInt(H/2) || x === parseInt(W/2)) {
                        c=[c[0]/2+255/2,c[1]/2+255/2,c[2]/2+255/2,255];
                    }

                    i = (y * view.offCanvas.width + x) * 4;
                    view.offPixelBuffer.data[ i ]  = c[0];
                    view.offPixelBuffer.data[ i + 1 ] = c[ 1 ];
                    view.offPixelBuffer.data[ i + 2 ] = c[ 2 ];
                    view.offPixelBuffer.data[ i + 3 ] = c[ 3 ];
                }
            }

            let ctx = view.canvas.getContext("2d");
            ctx.putImageData(view.offPixelBuffer, 0, 0);
/*
            view.offContext.putImageData(view.offPixelBuffer, 0, 0);
            let imageData = me.offCanvas.toDataURL();

            return imageData;
*/
        },

        /**
          * @func setPlane
          * @desc Set view's plane to sag, cor or axi, configures orientation information display,
          *       configures onscreen canvas size
          */
        setPlane: function setPlane(view, plane, doDrawFlag) {
            view.plane = plane;

            if (doDrawFlag == undefined) {
                doDrawFlag = true;
            }

            view.maxSlice = me.dimensions[me.space][plane].D - 1;

            const {W, H, D, Wdim, Hdim} = me.dimensions[me.space][plane];
            view.slice = parseInt((D - 1)/2);
            view.slider.max = view.maxSlice;
            view.slider.value = view.slice;
            view.canvas.width = W;
            view.canvas.height = H * Hdim / Wdim;

            me.configureInformation(view);

            if (doDrawFlag == true)
              me.draw();
        },

        /**
          * @desc Changes the space in which the data is displayed, updates the image and
          *       information
          * @param space string Space string: voxel, world or absolute
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
          * @desc Sets the slice displayed in the specified viewer
          * @param slice number Slice number
          * @param view object View object
          */
        setSlice: function setSlice(view, slice) {
            let slider = view.elem.getElementsByClassName('slice')[0];
            var maxSlice;

            // Check that slice number is within the interval [0, max)
            if (slice < 0)
                slice = 0;
            if (slice > view.maxSlice)
                slice = view.maxSlice;

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
            let N = view.elem.getElementsByClassName('N')[0];
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
                    let {W, H, D, Wdim, Hdim} = me.dimensions.absolute[view.plane];
                    switch (view.plane) {
                        case 'sag':
                            N.innerHTML = 'LR: ' + (view.slice - parseInt(D/2));
                            break;
                        case 'cor':
                            N.innerHTML = 'PA: ' + (view.slice - parseInt(D/2));
                            break;
                        case 'axi':
                            N.innerHTML = 'IS: ' + (view.slice - parseInt(D/2));
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
        },
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

    return me;
}
