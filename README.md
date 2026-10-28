# Geoportal Cultural del Perú — primera fase

Prototipo estático para publicar con GitHub Pages.

## Archivos
- `index.html`: estructura de la página.
- `estilos.css`: diseño adaptable a escritorio y móvil.
- `app.js`: mapa Leaflet, puntos demostrativos, búsqueda local y controles.

## Publicación con GitHub Pages
1. Crea un repositorio público llamado `geoportal-cultural` en GitHub.
2. Sube estos tres archivos a la raíz del repositorio.
3. Abre **Settings → Pages**.
4. En **Build and deployment**, selecciona **Deploy from a branch**.
5. Selecciona la rama `main` y la carpeta `/(root)`, y pulsa **Save**.
6. Espera la publicación y abre la URL que aparece en la sección Pages.

La URL normalmente será:
`https://TU-USUARIO.github.io/geoportal-cultural/`

## Importante
- Este sitio es estático; no contiene servidor ni base de datos.
- Los puntos culturales son ficticios y se usan solo para demostrar el diseño.
- No subas DNI, teléfonos, correos personales, contraseñas ni bases RENTOCA con datos personales.
- El mapa base requiere internet y atribución a OpenStreetMap.
- En la siguiente fase se pueden conectar capas públicas exportadas a GeoJSON o servicios WMS/WFS de GeoServer.
