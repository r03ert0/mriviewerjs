'use strict';

/*
    Initialisation:
    - init
        calls setView
    
    Change slice events:
    - setSlice
    - nextSlice
    - previousSlice
    
*/
var MRIViewer = {
    mri: null,              // mri data
    view: null,             // view: sag, axi or cor
    slice: null,            // slice number
    maxSlice: null,         // maximum slice number for the selected view
    canvas: null,           // canvas element in dom
    context: null,          // canvas's context
    W: null,                // canvas's width
    H: null,                // canvas's height
    offCanvas: null,        // offscreen canvas
	offContext: null,       // ofscreen canvas's context
	offPixelBuffer: null,   // offscreen pixel buffer
	
    init: function init(params) {
        var me=MRIViewer;
        
        // check params
        if(!params.mri) {
            console.error("No MRI");
            return;
        }

        if(!params.canvas) {
            console.error("No canvas");
            return;
        }
        
        // set params
        me.mri=params.mri;
        me.canvas=params.canvas;
        
        // set default view
        me.view='sag';
        
        // set default slice to mid-slice
		switch(me.view) {
			case 'sag':	[me.slice, me.maxSlice]=[parseInt(me.mri.dim[0]/2), me.mri.dim[0]-1]; break; // sagital
			case 'cor':	[me.slice, me.maxSlice]=[parseInt(me.mri.dim[1]/2), me.mri.dim[1]-1]; break; // coronal
			case 'axi':	[me.slice, me.maxSlice]=[parseInt(me.mri.dim[2]/2), me.mri.dim[2]-1]; break; // axial
		}
        
        // init canvas and context
        me.context=me.canvas.getContext('2d');
        me.offCanvas=document.createElement('canvas'),
        me.offContext=me.offCanvas.getContext('2d');
    },
    draw: function draw() {
		var me=MRIViewer;
		var dim=me.mri.dim;
		var pixdim=me.mri.pixdim;
	
		switch(me.view) {
			case 'sag':	[me.W, me.H, me.brain_D, me.Wdim, me.Hdim]=[dim[1], dim[2], dim[0], pixdim[1], pixdim[2]]; break; // sagital
			case 'cor':	[me.W, me.H, me.brain_D, me.Wdim, me.Hdim]=[dim[0], dim[2], dim[1], pixdim[0], pixdim[2]]; break; // coronal
			case 'axi':	[me.W, me.H, me.brain_D, me.Wdim, me.Hdim]=[dim[0], dim[1], dim[2], pixdim[0], pixdim[1]]; break; // axial
		}

		me.canvas.width=me.W;
		me.canvas.height=me.H*me.Hdim/me.Wdim;
		
		me.offCanvas.width=me.W;
		me.offCanvas.height=me.H;
		me.offPixelBuffer=me.offContext.getImageData(0,0,me.offCanvas.width,me.offCanvas.height);

		var	s, i, val;
		var x, y;
		var ys, yc, ya;

		ys=yc=ya=me.slice;
		for(y=0;y<me.H;y++)
		for(x=0;x<me.W;x++) {
			switch(me.view) {
				case 'sag':s=[ys,x,me.H-1-y]; break;
				case 'cor':s=[x,yc,me.H-1-y]; break;
				case 'axi':s=[x,me.H-1-y,ya]; break;
			}
			i=s[2]*me.mri.dim[1]*me.mri.dim[0] + s[1]*me.mri.dim[0] + s[0];
			val=me.mri.data[i];

			var c=[val,val,val,255];
			i=(y*me.offCanvas.width+x)*4;
			me.offPixelBuffer.data[ i ]  =c[0];
			me.offPixelBuffer.data[ i+1 ]=c[1];
			me.offPixelBuffer.data[ i+2 ]=c[2];
			me.offPixelBuffer.data[ i+3 ]=c[3];
		}
		me.offContext.putImageData(me.offPixelBuffer, 0, 0);

		me.context.drawImage(me.offCanvas,0,0,me.W,me.H*me.Hdim/me.Wdim);

    },
    setView: function setView(view) {
		var me=MRIViewer;
		me.view=view;
        switch(me.view) {
            case 'sag':
                me.maxSlice=me.mri.dim[0]-1;
                break;
            case 'cor':
                me.maxSlice=me.mri.dim[1]-1;
                break;
            case 'axi':
                me.maxSlice=me.mri.dim[2]-1;
                break;
        }
		me.draw();
    },
    setSlice: function setSlice(sliceNumber) {
		var me=MRIViewer;
        var maxSlice;
        
        // check that sliceNumber is not <0
        if(sliceNumber<0)
            sliceNumber=0;
        
        // check that sliceNumber is not > maximum
        if(sliceNumber>me.maxSlice)
            sliceNumber=me.maxSlice;
        
        me.slice=sliceNumber;
        me.draw();
    },
    nextSlice: function nextSlice() {
		var me=MRIViewer;
		me.setSlice(me.slice+1);
    },
    previousSlice: function previousSlice() {
		var me=MRIViewer;
		me.setSlice(me.slice-1);
    }
}