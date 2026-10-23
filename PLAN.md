# Plan: McL City (mundo abierto estilo San Andreas, sin misiones)

## Qué es

Un sandbox de mundo abierto en 3D: una ciudad infinita generada por algoritmo donde andas, robas coches, conduces, peleas y huyes de la policía. No hay historia ni misiones, solo las mecánicas. No se usan nombres, marcas, logotipos ni personajes de juegos comerciales.

## El mundo

- **Ciudad infinita** en cuadrícula: calles cada 60 m, un carril por sentido, aceras y manzanas. Cada manzana sale de una semilla de sus coordenadas, así que siempre es la misma.
- **Distritos**, decididos por ruido: Centro (rascacielos), Comercial, Residencial, Barrio (zona de bandas), Industrial (naves y contenedores) y Parque. Lejos del centro aparecen campo y desierto.
- **Servicios en cada zona de 5×5 manzanas**: hospital, comisaría, armería, comida rápida y taller de pintura. Tu casa está en la manzana (0, 0).
- **Nombres de barrio** generados, que se muestran al entrar, como en San Andreas.
- **Ciclo de día y noche** (1 minuto del juego = 1 s real): sol que se mueve, ventanas y farolas encendidas de noche, faros en los coches y cielo negro puro de noche (AMOLED).

## Mecánicas

1. **A pie**: andar, correr (con aguante), saltar, puñetazos y bate.
2. **Coches**: entrar y salir de cualquier coche. Si tiene conductor, lo sacas. Siete tipos (compacto, sedán, deportivo, todoterreno, taxi, furgoneta y patrulla) con velocidad, aceleración, agarre y resistencia propios. Física arcade con freno de mano para derrapar, choques con daño, humo, fuego y explosión, claxon y rampas para saltos únicos.
3. **Armas**: pistola, escopeta, subfusil, fusil y lanzacohetes, con apuntado fijado (automático en el móvil). La armería las desbloquea según el nivel de respeto.
4. **Nivel de búsqueda (1 a 5 ★)**: los delitos suben el «calor». Con 1 ★ la policía intenta arrestarte, con 2 ★ dispara, las patrullas te persiguen y embisten, y con 4 ★ llega el helicóptero. Las estrellas bajan si nadie te ve durante un rato. El taller de pintura las borra y repara el coche por 100 $.
5. **Tráfico y peatones**: coches que siguen los carriles y giran en los cruces, peatones por las aceras que huyen de los tiros o te plantan cara, coches aparcados y bandas en los barrios (la rival te ataca a partir de cierto nivel).
6. **Dinero**: lo sueltan los peatones, se gana con los paquetes ocultos (uno por zona) y los saltos únicos, y se puede atracar la tienda de comida (da estrellas). Se gasta en armas, munición, chaleco, comida y en el taller.
7. **Vida y chaleco**. **Muerto**: vuelves en el hospital más cercano y pagas 100 $. **Arrestado**: vuelves en la comisaría y pierdes las armas.
8. **Habilidades como en San Andreas**: aguante (sube al correr), conducción (al conducir) y puntería (al disparar).
9. **Radio** al ir en coche: tres emisoras con música sintetizada, sin archivos.
10. **Trucos** que se escriben en la pausa (vida y dinero, sin policía, armas...).
11. **Casa**: recupera la vida, guarda y tiene un armario que abre la pantalla 👕 Personaje.

## Niveles infinitos (regla 1)

El **nivel de respeto** sube con el respeto que ganas al escapar de la policía (más cuantas más estrellas), encontrar paquetes, hacer saltos y vencer a la banda rival. No tiene tope. Con cada nivel la policía aparece antes, tiene más vida y apunta mejor, la banda rival es más agresiva y la armería desbloquea más armas. El nivel, el dinero, las armas, las habilidades, los paquetes y los saltos se guardan en el navegador.

## Pantallas (reglas 3 y 4)

- Bienvenida (pedir nombre) y menú principal: Jugar, 👕 Personaje, Récords, Configuración y botón de dificultad.
- Juego con HUD estilo San Andreas: reloj, arma y munición, vida, chaleco, dinero y estrellas arriba a la derecha, y radar circular con calles, servicios, policía y paquetes cercanos.
- Pausa: Continuar, Mapa, Trucos, Configuración y Salir.
- Tiendas (armería, comida, casa): paneles que pausan el juego.
- Fin de partida («Has muerto» o «Te han arrestado»): resumen de la sesión, Reintentar (volver en el hospital o la comisaría) y Menú.
- Récords: nivel de respeto, mejores persecuciones (estrellas máximas y tiempo), dinero, paquetes, saltos, coches robados y distancia recorrida.

## Controles

- **Teclado y ratón**: WASD, ratón para la cámara, clic izquierdo para disparar o golpear, clic derecho para fijar el objetivo, Mayús para correr, Espacio para saltar (en coche, freno de mano), F para entrar o salir, Q/E o la rueda para cambiar de arma, H para el claxon, R para la radio y P para la pausa.
- **Mando**: la misma disposición que en el móvil.
- **Móvil**: mando de PSP en pantalla (`ui/psp.ts`, como Valhalla) con la distribución de los GTA de PSP. Stick para moverse, ✕ correr o acelerar, □ saltar o frenar, ○ disparar, △ entrar o salir, R fijar objetivo o freno de mano, L cámara, cruceta ◀ ▶ arma, ▲ radio y ▼ claxon, SELECT mapa y START pausa. Se arrastra en la pantalla para mover la cámara.

## Técnica y rendimiento

- `src/core/*` es lógica pura y testeable: `ciudad.ts` (generación, consultas por celda y rayos con DDA), `fisica.ts`, `vehiculos.ts` (física del coche), `armas.ts`, `buscado.ts`, `respeto.ts`, `difficulty.ts` y `rng.ts` (con ruido).
- `src/game/logica.ts` es la sesión (jugador, entidades, delitos y eventos), `ia.ts` el tráfico, los peatones, la policía y el helicóptero, y `render3d.ts` el dibujo con three.js (carga diferida).
- **Pocas llamadas de dibujo** para ir a 60 FPS en el móvil:
  - El suelo es un solo plano que sigue a la cámara, con la textura de una manzana repetida (calzada, aceras y pasos de cebra).
  - Edificios, árboles, farolas y solares van en `InstancedMesh`, con las UV calculadas en coordenadas del mundo para que las ventanas no se estiren y ventanas que brillan de noche.
  - Los coches son instancias por tipo (pintura con `instanceColor`), con ruedas, luces y sirenas en instancias globales.
  - Los peatones son instancias por apariencia: los avatares de `createAvatar` se «hornean» en cuerpo y brazos con colores por vértice. El jugador usa el avatar completo.
- Las entidades aparecen y desaparecen en un anillo alrededor del jugador, fuera de la vista de la cámara.
- Densidad de tráfico y peatones configurable. La calidad Baja acorta la distancia de dibujo y quita las sombras.

## Reglas comunes (netlify/CLAUDE.md)

3D con three.js, avatares del Arcade, 4 dificultades (`MODOS`: daño recibido, reacción y puntería de la policía, dinero ganado), configuración común (Jugador, Juego, Sonido con volumen de música por la radio, Pantalla y Mis datos), pantalla completa por defecto, modo oscuro AMOLED, PWA sin conexión, `rendimiento.ts`, iconos con `iconos.mjs city`, repo `mclvega/mcl-city` y sitio `mcl-city.netlify.app`, más la tarjeta en la portada y la fila en la tabla de CLAUDE.md.

## Fases de trabajo

1. Estructura del proyecto, ciudad, física y tests de lo básico.
2. Jugador a pie, cámara y render de la ciudad (suelo, edificios y día/noche).
3. Coches: física, entrar y salir, tráfico y coches aparcados.
4. Peatones, armas, combate y pickups.
5. Policía, estrellas, helicóptero, taller, muerte y arresto.
6. Servicios y tiendas, paquetes, rampas, respeto y habilidades.
7. HUD, radar, mapa, radio, trucos, menús y configuración.
8. Typecheck, tests y build, repo y Netlify, portada y CLAUDE.md.

## Ideas siguientes

- Motos y bicicletas.
- Reclutar miembros de tu banda.
- Taxis y otras actividades secundarias opcionales.
- Lluvia y niebla.
- Agua, playas y barcos.
