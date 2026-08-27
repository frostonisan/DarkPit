// Ground_fx : droplet, swampFog
// meteo : snowstorm, sunray, waterDrop

export const levelBiome = [
  {
    name: 'Prison',
    classe: 'prison',
    serial: 1,
    foreground: "../../media/decors/prison/foreground.png",
    foreground_color: "#000000",
    ground: "../../media/decors/prison/ground.jpg",
    background: "../../media/decors/prison/background.jpg",
	ground_fx: "droplet",
	meteo: "waterDrop",
	sound:"/media/sound/ambiant/prison.mp3"
  },{
    name: 'Marécage',
    classe: 'marecage',
    serial: 2,
    foreground: "../../media/decors/marecage/foreground.png",
    foreground_color: "#45555",
    ground: "../../media/decors/marecage/ground.jpg",
	ground_fx: "swampFog",
	background: "../../media/decors/marecage/background.jpg",
	sound:"/media/sound/ambiant/swamp.mp3"
  },{
    name: 'Désert',
    classe: 'desert',
    serial: 3,
    foreground: "../../media/decors/desert/foreground.png",
    foreground_color: "#45555",
    ground: "../../media/decors/desert/ground.jpg",
	background: "../../media/decors/desert/background.jpg",
	meteo: "sunray",
	sound:"/media/sound/ambiant/desert.mp3"
  },{
    name: 'Glacier',
    classe: 'glacier',
    serial: 4,
    foreground: "../../media/decors/glacier/foreground.png",
    foreground_color: "#45555",
    ground: "../../media/decors/glacier/ground.jpg",
	background: "../../media/decors/glacier/background.jpg",
	meteo: "snowstorm, sunray ",
	sound:"/media/sound/ambiant/artic.mp3"
  }
];