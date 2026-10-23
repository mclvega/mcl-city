# McL City

Mundo abierto en 3D para el navegador, sin misiones: solo las mecánicas. Una ciudad infinita generada por algoritmo donde andas, robas coches, conduces, peleas y huyes de la policía.

- **Ciudad sin fin** en cuadrícula, con distritos (centro con rascacielos, comercial, residencial, barrios, industria, parques, campo y desierto), nombres de barrio y ciclo de día y noche (ventanas y farolas encendidas, faros, cielo negro de noche).
- **Coches**: entra en cualquiera (si tiene conductor, lo sacas). Siete tipos con su velocidad, aceleración y agarre: compacto, sedán, deportivo, todoterreno, taxi, furgoneta y patrulla. Freno de mano para derrapar, choques con daño, humo, fuego y explosión, claxon, rampas con **saltos únicos** y radio con tres emisoras sintetizadas.
- **Armas**: puños, bate, pistola, escopeta, subfusil, fusil y lanzacohetes, con apuntado fijado. La armería las desbloquea según tu respeto.
- **Nivel de búsqueda de 1 a 5 ★**: con 1 ★ te intentan arrestar, con 2 ★ disparan, las patrullas te persiguen y embisten, y con 4 ★ llega el helicóptero. Las estrellas bajan si nadie te ve. En el taller **Pinta y Listo** se borran por 100 $.
- **Tráfico y peatones** que siguen las calles y las aceras, huyen de los tiros o se defienden. Bandas en los barrios: la familia te ayuda y la rival te ataca a partir del respeto 3.
- **Respeto sin tope**: sube al escapar de la policía, encontrar paquetes ocultos, hacer saltos y vencer a la banda rival. Cada nivel endurece la ciudad.
- **Servicios** en cada zona: hospital, comisaría, armería, Pollo Feliz (comida y atracos) y taller. En tu casa descansas y cambias de ropa.
- **Habilidades** como en San Andreas (aguante, conducción y puntería), trucos en la pausa, muerte (hospital) y arresto (comisaría).
- Teclado y ratón, mando y, en el móvil, un mando de PSP en pantalla. Funciona sin conexión (PWA) y el progreso queda en el navegador.

Publicado en https://mcl-city.netlify.app

## Desarrollo

```sh
npm install
npm run dev      # ?demo empieza directamente; &prueba=coche|policia|tiroteo, &hora=22, &diag, &tactil
npm test
npm run build
```

`src/core/*` es la lógica pura (ciudad, física, coches, armas, búsqueda, respeto y tiempo), `src/game/logica.ts` la partida, `src/game/ia.ts` el tráfico, los peatones, la policía y el helicóptero, y `src/game/render3d.ts` el dibujo con three.js (casi todo con instancias para ir fluido en el móvil).
