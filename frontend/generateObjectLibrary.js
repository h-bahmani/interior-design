const fs = require("fs");
const path = require("path");


const OBJECTS_DIR = path.join(
  __dirname,
  "public",
  "objects"
);


const OUTPUT_FILE = path.join(
  __dirname,
  "src",
  "data",
  "objectLibrary.js"
);


const EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp"
];


const library = {};


const folders = fs.readdirSync(OBJECTS_DIR);


folders.forEach(folder=>{

  const folderPath = path.join(
    OBJECTS_DIR,
    folder
  );


  if(!fs.statSync(folderPath).isDirectory())
    return;


  const files = fs.readdirSync(folderPath);


  const images = files
    .filter(file =>
      EXTENSIONS.includes(
        path.extname(file).toLowerCase()
      )
    )
    .map(file=>({

      name:path.parse(file).name,

      url:`/objects/${folder}/${file}`

    }));


  if(images.length){

    library[folder]=images;

  }


});



const output = 
`const objectLibrary = ${JSON.stringify(
  library,
  null,
  2
)};


export default objectLibrary;
`;


fs.writeFileSync(
  OUTPUT_FILE,
  output,
  "utf8"
);


console.log(
  "✅ objectLibrary.js generated"
);