export const scenarios = [
    {
         minEntities: 2,
        maxEntities: 10,
        hexagons: 40,
        rows: 5, // ligne
        cols: 10, // colonne
        // .background-Haut
        backgroundTop: '-25%',
        backgroundSize: '47%',
        // .board-global
        boardGlobalTransform: 'scale(1.15)',
        boardGlobalLeft: '15%',
        boardGlobalTop: '19%',
    },{
		// paralaxe done
        minEntities: 11,
        maxEntities: 25,
        hexagons: 65,
        rows: 6,
        cols: 13,
          // .background-Haut
        backgroundTop: '-21%',
        backgroundSize: '41%',
        // .board-global
        boardGlobalTransform: 'scale(1)',
        boardGlobalLeft: '0%',
        boardGlobalTop: '5%',
    },{
        minEntities: 26,
        maxEntities: 50,
        hexagons: 150,
        rows: 7,
        cols: 15,
      backgroundTop: '-23%',
        backgroundSize: '46%',
        // .board-global
        boardGlobalTransform: 'scale(0.8)',
        boardGlobalLeft: '-8%',
        boardGlobalTop: '-3%',
    },{
        minEntities: 51,
        maxEntities: 100,
        hexagons: 300,
        rows: 15,
        cols: 35,
        backgroundTop: '-23%',
        backgroundSize: '46%',
        // .board-global
        boardGlobalTransform: 'scale(0.8)',
        boardGlobalLeft: '-8%',
        boardGlobalTop: '-3%',
    }
];
