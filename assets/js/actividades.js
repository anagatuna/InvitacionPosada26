/* =========================================================
   ✏️  MINIJUEGOS — EDITA AQUÍ LAS DINÁMICAS
   ---------------------------------------------------------
   Cada objeto = una tarjeta que se voltea.
     icono       → emoji o texto corto del frente
     ronda       → etiqueta pequeña sobre el título
     titulo      → nombre del minijuego
     frase       → subtítulo del frente
     descripcion → explicación (reverso)
     detalles    → etiquetas cortas (reverso), p. ej. jugadores o premio
   Agrega, quita o reordena objetos libremente; la página
   genera las tarjetas automáticamente.
   ========================================================= */
window.ACTIVIDADES = [
  {
    icono: "🎲",
    ronda: "Ronda 1",
    titulo: "Tablero de Dados",
    frase: "Avanza, roba y sorprende",
    descripcion: "Cada equipo tira el dado gigante y avanza por el tablero. Las casillas doradas dan estrellas; las de bronce, retos.",
    detalles: ["Equipos de 4", "10 min", "⭐ x2"]
  },
  {
    icono: "🦌",
    ronda: "Ronda 2",
    titulo: "Carrera de Renos",
    frase: "Relevos a toda velocidad",
    descripcion: "Relevos por parejas con astas de reno: lleva la esfera en la cuchara sin dejarla caer hasta la meta.",
    detalles: ["Parejas", "5 min", "⭐ x1"]
  },
  {
    icono: "🎶",
    ronda: "Ronda 3",
    titulo: "Duelo de Villancicos",
    frase: "Adivina la canción",
    descripcion: "Suenan 5 segundos de una canción navideña. El primer equipo en tocar la campana y adivinarla se lleva el punto.",
    detalles: ["Todos", "8 min", "⭐ x1"]
  },
  {
    icono: "🎁",
    ronda: "Ronda 4",
    titulo: "Memoria de Esferas",
    frase: "Encuentra los pares",
    descripcion: "Voltea dos esferas a la vez y encuentra los pares escondidos antes que el equipo rival. ¡Cuidado con la esfera trampa!",
    detalles: ["1 vs 1", "6 min", "⭐ x1"]
  },
  {
    icono: "🪅",
    ronda: "Ronda 5",
    titulo: "Piñata de la Suerte",
    frase: "Todo o nada",
    descripcion: "Gira la ruleta: puede tocarte romper la piñata, intercambiar estrellas con otro equipo o perder tu turno.",
    detalles: ["Por turnos", "10 min", "⭐ ?"]
  },
  {
    icono: "👑",
    ronda: "Gran final",
    titulo: "Batalla de Estrellas",
    frase: "Se corona al campeón",
    descripcion: "Los dos equipos con más estrellas se enfrentan en un minijuego sorpresa. El ganador se lleva el trofeo de la posada.",
    detalles: ["Finalistas", "10 min", "🏆"]
  }
];
