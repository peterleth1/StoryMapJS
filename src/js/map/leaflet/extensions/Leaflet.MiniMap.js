import { LeafletModule } from "leaflet";
/*
	https://github.com/Norkart/Leaflet-MiniMap
	
*/


const BASE_OPTIONS = {
        position: 'bottomright',
        toggleDisplay: false,
        zoomLevelOffset: -5,
        zoomLevelFixed: false,
        zoomAnimation: false,
        autoToggleDisplay: false,
		show_view: true,
        width: 150,
        height: 150,
        aimingRectOptions: {
            color: "#c34528",
            weight: 1,
            clickable: false,
			stroke:true
        },
        shadowRectOptions: {
            color: "#000000",
            weight: 1,
            clickable: false,
            opacity: 0,
            fillOpacity: 0
        }
    };

export default class MiniMapControl extends L.Control {

    //layer is the map layer to be shown in the minimap
	constructor(layer, options) {
        let _options = Object.assign({}, BASE_OPTIONS, options);
        super(layer, _options);
        L.Util.setOptions(this, _options);
        this.hideText = 'Hide MiniMap';
        this.showText = 'Show MiniMap';
        //Make sure the aiming rects are non-clickable even if the user tries to set them clickable (most likely by forgetting to specify them false)
        this.options.aimingRectOptions.clickable = false;
        this.options.shadowRectOptions.clickable = false;
        this._layer = layer;
    }

    onAdd(map) {

        this._mainMap = map;

        //Creating the container and stopping events from spilling through to the main map.
        this._container = L.DomUtil.create('div', 'leaflet-control-minimap');
        this._container.style.width = this.options.width + 'px';
        this._container.style.height = this.options.height + 'px';
        L.DomEvent.disableClickPropagation(this._container);
        L.DomEvent.on(this._container, 'mousewheel', L.DomEvent.stopPropagation);


        this._miniMap = new L.Map(this._container, {
            attributionControl: false,
            zoomControl: false,
            zoomAnimation: this.options.zoomAnimation,
            autoToggleDisplay: this.options.autoToggleDisplay,
            touchZoom: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            boxZoom: false,
			dragging:false,
            crs: map.options.crs
        });

        this._miniMap.addLayer(this._layer);

        //These bools are used to prevent infinite loops of the two maps notifying each other that they've moved.
        this._mainMapMoving = false;
        this._miniMapMoving = false;

        //Keep a record of this to prevent auto toggling when the user explicitly doesn't want it.
        this._userToggledDisplay = false;
        this._minimized = false;

        if (this.options.toggleDisplay) {
            this._addToggleButton();
        }

        this._miniMap.whenReady(L.Util.bind(function() {
            this._aimingRect = L.rectangle(this._mainMap.getBounds(), this.options.aimingRectOptions).addTo(this._miniMap);
            this._shadowRect = L.rectangle(this._mainMap.getBounds(), this.options.shadowRectOptions).addTo(this._miniMap);
			
			this._locationCircle = L.circleMarker(this._mainMap.getCenter(), {
				fillColor: "#c34528",
				color: "#FFFFFF",
				weight:2,
				radius: 10,
				fill:true,
				fillOpacity: 1,
				stroke:true,
				clickable: false
			}).addTo(this._miniMap);
			this._locationCircle.setRadius(5);
			
            this._mainMap.on('moveend', this._onMainMapMoved, this);
            this._mainMap.on('move', this._onMainMapMoving, this);
            //this._miniMap.on('movestart', this._onMiniMapMoveStarted, this);
            //this._miniMap.on('move', this._onMiniMapMoving, this);
            //this._miniMap.on('moveend', this._onMiniMapMoved, this);
			if (this.options.bounds_array) {
				this._miniMap.fitBounds(this.options.bounds_array, {padding:[15,15]});
			}
        }, this));

        return this._container;
    }
	
	minimize(hide_completely) {
        /* It is not clear if we want to support a minimize option, but if we
           do, we will need to sort out why this function is currently being
           called in the normal course of navigation. In the mean time, this
           code is commented out to prevent inadvertent minimization. */
        /*
		if (!this._minimized) {
			this._minimize();
		}
        */
	}
	
	restore() {
		if (this._minimized) {
			this._restore();
			this._miniMap.fitBounds(this.options.bounds_array, {padding:[15,15]});
		}
	}

    addTo(map) {
        L.Control.prototype.addTo.call(this, map);
        this._miniMap.setView(this._mainMap.getCenter(), this._decideZoom(true));
        this._setDisplay(this._decideMinimized());
        return this;
    }

    onRemove(map) {
        this._mainMap.off('moveend', this._onMainMapMoved, this);
        this._mainMap.off('move', this._onMainMapMoving, this);
        this._miniMap.off('moveend', this._onMiniMapMoved, this);

        this._miniMap.removeLayer(this._layer);
    }

    _addToggleButton() {
        this._toggleDisplayButton = this.options.toggleDisplay ? this._createButton('', this.hideText, 'leaflet-control-minimap-toggle-display', this._container, this._toggleDisplayButtonClicked, this) : undefined;
    }

    _createButton(html, title, className, container, fn, context) {
        var link = L.DomUtil.create('a', className, container);
        link.innerHTML = html;
        link.href = '#';
        link.title = title;

        var stop = L.DomEvent.stopPropagation;

        L.DomEvent.on(link, 'click', stop)
            .on(link, 'mousedown', stop)
            .on(link, 'dblclick', stop)
            .on(link, 'click', L.DomEvent.preventDefault)
            .on(link, 'click', fn, context);

        return link;
    }

    _toggleDisplayButtonClicked() {
        this._userToggledDisplay = true;
        if (!this._minimized) {
            this._minimize();
            this._toggleDisplayButton.title = this.showText;
        } else {
            this._restore();
            this._toggleDisplayButton.title = this.hideText;
        }
    }

    _setDisplay(minimize) {
        if (minimize != this._minimized) {
            if (!this._minimized) {
                this._minimize();
            } else {
                this._restore();
            }
        }
    }

    _minimize() {
        this._container.style.width = '0px';
        this._container.style.height = '0px';
        this._minimized = true;
    }

    _restore() {
        this._container.style.width = this.options.width + 'px';
        this._container.style.height = this.options.height + 'px';
        this._minimized = false;
    }

    _onMainMapMoved(e) {
        if (!this._miniMapMoving) {
			var zoom = this._decideZoom(true);
			if (zoom != 0) {
				//this._miniMap.setView(this._mainMap.getCenter(), this._decideZoom(true));
				//this._miniMap.setView(this._mainMap.getCenter());
			}
            this._mainMapMoving = true;

            this._setDisplay(this._decideMinimized());
        } else {
            this._miniMapMoving = false;
        }
		if (this.options.show_view) {
			this._aimingRect.setBounds(this._mainMap.getBounds());
		}
		this._locationCircle.setLatLng(this._mainMap.getCenter());
        
    }

    _onMainMapMoving(e) {
		if (this.options.show_view) {
			this._aimingRect.setBounds(this._mainMap.getBounds());
		}
		this._locationCircle.setLatLng(this._mainMap.getCenter());
    }

    _onMiniMapMoveStarted(e) {
        var lastAimingRect = this._aimingRect.getBounds();
        var sw = this._miniMap.latLngToContainerPoint(lastAimingRect.getSouthWest());
        var ne = this._miniMap.latLngToContainerPoint(lastAimingRect.getNorthEast());
        this._lastAimingRectPosition = {
            sw: sw,
            ne: ne
        };
    }

    _onMiniMapMoving(e) {
        if (!this._mainMapMoving && this._lastAimingRectPosition) {
            this._shadowRect.setBounds(new L.LatLngBounds(this._miniMap.containerPointToLatLng(this._lastAimingRectPosition.sw), this._miniMap.containerPointToLatLng(this._lastAimingRectPosition.ne)));
            this._shadowRect.setStyle({
                opacity: 1,
                fillOpacity: 0.3
            });
        }
    }

    _onMiniMapMoved(e) {
        if (!this._mainMapMoving) {
            this._miniMapMoving = true;
            this._mainMap.setView(this._miniMap.getCenter(), this._decideZoom(false));
            this._shadowRect.setStyle({
                opacity: 0,
                fillOpacity: 0
            });
        } else {
            this._mainMapMoving = false;
        }
    }

    _decideZoom(fromMaintoMini) {
        if (!this.options.zoomLevelFixed && this.options.zoomLevelFixed != 0) {
            if (fromMaintoMini) {
				return this._mainMap.getZoom() + this.options.zoomLevelOffset;
			} else {
				var currentDiff = this._miniMap.getZoom() - this._mainMap.getZoom();
				var proposedZoom = this._miniMap.getZoom() - this.options.zoomLevelOffset;
				var toRet;

				if (currentDiff > this.options.zoomLevelOffset && this._mainMap.getZoom() < this._miniMap.getMinZoom() - this.options.zoomLevelOffset) {
				    //This means the miniMap is zoomed out to the minimum zoom level and can't zoom any more.
				    if (this._miniMap.getZoom() > this._lastMiniMapZoom) {
				        //This means the user is trying to zoom in by using the minimap, zoom the main map.
				        toRet = this._mainMap.getZoom() + 1;
				        //Also we cheat and zoom the minimap out again to keep it visually consistent.
				        this._miniMap.setZoom(this._miniMap.getZoom() - 1);
				    } else {
				        //Either the user is trying to zoom out past the mini map's min zoom or has just panned using it, we can't tell the difference.
				        //Therefore, we ignore it!
				        toRet = this._mainMap.getZoom();
				    }
				} else {
				    //This is what happens in the majority of cases, and always if you configure the min levels + offset in a sane fashion.
				    toRet = proposedZoom;
				}
				this._lastMiniMapZoom = this._miniMap.getZoom();
				return toRet;
            }
        } else {
            if (fromMaintoMini) {
				return this.options.zoomLevelFixed;
			} else {
				return this._mainMap.getZoom();
			}
             
        }
    }

    _decideMinimized() {
        if (this._userToggledDisplay) {
            return this._minimized;
        }

        if (this.options.autoToggleDisplay) {
            if (this._mainMap.getBounds().contains(this._miniMap.getBounds())) {
                return true;
            }
            return false;
        }

        return this._minimized;
    }
}

L.Map.mergeOptions({
    miniMapControl: false
});

L.Map.addInitHook(function() {
    if (this.options.miniMapControl) {
        this.miniMapControl = (new L.Control.MiniMap()).addTo(this);
    }
});

L.control.minimap = function(options) {
    return new L.Control.MiniMap(options);
};

