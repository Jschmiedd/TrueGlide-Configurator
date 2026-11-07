import { View, Map, Feature } from "ol";
import { fromLonLat } from "ol/proj";
import { Tile, Vector as LayerVector } from "ol/layer";
import { OSM, XYZ, Vector as SourceVector } from "ol/source";
import { Icon, Style } from "ol/style";
import { Point } from "ol/geom";
import { i18n } from "../localization";

// TrueGlide (audit du 06/11/2026, mineur) : les fonds Google (satellite, hybride) ne sont chargés qu'après accord
// (une fois, gardé dans ce navigateur). Sans accord : plan OpenStreetMap, aucune requête vers Google.
const GOOGLE_CONSENT_KEY = "trueglideGoogleTilesConsent";
const GOOGLE_URLS = {
    satellite: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    hybrid: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
};
export function googleTilesAllowed(storage = globalThis.localStorage) {
    try {
        return storage?.getItem(GOOGLE_CONSENT_KEY) === "yes";
    } catch {
        return false;
    }
}
function rememberGoogleConsent(storage = globalThis.localStorage) {
    try {
        storage?.setItem(GOOGLE_CONSENT_KEY, "yes");
    } catch {
        // navigation privée : l'accord vaut pour cette page seulement
    }
}
// Fond à afficher : un fond Google demande l'accord (confirm) ; refusé -> « street ». Active les URL Google si accepté.
export function chooseLayer(layerKey, instance, ask = (m) => globalThis.confirm?.(m)) {
    if (!(layerKey in GOOGLE_URLS)) {
        return layerKey;
    }
    let ok = googleTilesAllowed() || instance?.googleEnabled;
    if (!ok && ask(i18n.getMessage("tfGoogleTilesConfirm"))) {
        rememberGoogleConsent();
        ok = true;
    }
    if (!ok) {
        return "street";
    }
    instance?.enableGoogle?.();
    return layerKey;
}
export function defaultMapLayer(wanted = "satellite") {
    return wanted in GOOGLE_URLS && !googleTilesAllowed() ? "street" : wanted;
}

const DEFAULT_ZOOM = 17;
const DEFAULT_LON = 0;
const DEFAULT_LAT = 0;
const ICON_IMAGE_GPS = "/images/icons/cf_icon_position.png";
const ICON_IMAGE_MAG = "/images/icons/cf_icon_position_mag.png";
const ICON_IMAGE_NOFIX = "/images/icons/cf_icon_position_nofix.png";

/**
 * Create and configure an OpenLayers map instance for the GPS tab.
 * UI bindings (layer selection, fullscreen, zoom buttons) are handled by the Vue component.
 */
export function initMap(options = {}) {
    const {
        target = "map",
        defaultZoom = DEFAULT_ZOOM,
        defaultLon = DEFAULT_LON,
        defaultLat = DEFAULT_LAT,
        defaultLayer: wantedLayer = "satellite",
    } = options;
    const googleOk = googleTilesAllowed();
    const defaultLayer = googleOk ? wantedLayer : defaultMapLayer(wantedLayer);

    const lonLat = fromLonLat([defaultLon, defaultLat]);

    const mapView = new View({
        center: lonLat,
        zoom: defaultZoom,
    });

    const devicePixelRatio = window.devicePixelRatio || 1;

    const layers = {
        street: new Tile({
            source: new OSM({
                tilePixelRatio: devicePixelRatio,
            }),
            visible: defaultLayer === "street",
        }),
        satellite: new Tile({
            source: new XYZ({
                url: googleOk ? GOOGLE_URLS.satellite : undefined,
                tilePixelRatio: devicePixelRatio,
            }),
            visible: defaultLayer === "satellite",
        }),
        hybrid: new Tile({
            source: new XYZ({
                url: googleOk ? GOOGLE_URLS.hybrid : undefined,
                tilePixelRatio: devicePixelRatio,
            }),
            visible: defaultLayer === "hybrid",
        }),
    };

    const map = new Map({
        target,
        layers: [layers.street, layers.satellite, layers.hybrid],
        view: mapView,
        controls: [],
    });

    const iconGPS = new Icon({
        anchor: [0.5, 1],
        opacity: 1,
        scale: 0.5,
        src: ICON_IMAGE_GPS,
    });

    const iconMag = new Icon({
        anchor: [0.5, 1],
        opacity: 1,
        scale: 0.5,
        src: ICON_IMAGE_MAG,
    });

    const iconNoFix = new Icon({
        anchor: [0.5, 1],
        opacity: 1,
        scale: 0.5,
        src: ICON_IMAGE_NOFIX,
    });

    const iconStyleGPS = new Style({
        image: iconGPS,
    });

    const iconStyleMag = new Style({
        image: iconMag,
    });

    const iconStyleNoFix = new Style({
        image: iconNoFix,
    });

    const iconGeometry = new Point(lonLat);

    const iconFeature = new Feature({
        geometry: iconGeometry,
    });

    iconFeature.setStyle(iconStyleGPS);

    const vectorSource = new SourceVector({
        features: [iconFeature],
    });

    const currentPositionLayer = new LayerVector({
        source: vectorSource,
    });

    map.addLayer(currentPositionLayer);

    const destroy = () => {
        // Clear vector source features
        vectorSource.clear();

        // Get all layers and dispose of them
        const allLayers = map.getLayers().getArray().slice(); // Clone array to avoid mutation during iteration
        allLayers.forEach((layer) => {
            map.removeLayer(layer);
            // Dispose of layer's source if it exists
            const source = layer.getSource();
            if (source && typeof source.dispose === "function") {
                source.dispose();
            }
        });

        // Dispose of the map (handles view, interactions, event listeners, controls, etc.)
        map.dispose();
    };

    const instance = {
        map,
        mapView,
        layers,
        googleEnabled: googleOk,
        enableGoogle() {
            if (!instance.googleEnabled) {
                layers.satellite.getSource().setUrl(GOOGLE_URLS.satellite);
                layers.hybrid.getSource().setUrl(GOOGLE_URLS.hybrid);
                instance.googleEnabled = true;
            }
        },
        iconStyleMag,
        iconStyleGPS,
        iconStyleNoFix,
        iconFeature,
        iconGeometry,
        destroy,
    };
    return instance;
}
