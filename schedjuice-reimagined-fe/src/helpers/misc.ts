const randomAnimals = [
    "elephant",
    "tiger",
    "lion",
    "giraffe",
    "zebra",
    "monkey",
    "penguin",
    "panda",
    "koala",
    "kangaroo",
    "hippo",
    "rhino",
    "crocodile",
    "alligator",
    "snake",
    "turtle",
    "frog",
    "lizard",
    "iguana",
    "chameleon",
  ];
  const randomAdjectives = [
    "brave",
    "calm",
    "delightful",
    "cute",
    "faithful",
    "gentle",
    "happy",
    "jolly",
    "kind",
    "lively",
    "nice",
    "proud",
    "silly",
    "thankful",
    "undefined",
    "victorious",
  ];
  export const getRandomWord = () => {
    return (
      randomAdjectives[Math.floor(Math.random() * randomAdjectives.length)] +
      " " +
      randomAnimals[Math.floor(Math.random() * randomAnimals.length)]
    );
  };
  

  export const htmlHeaderString = `
   <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html><head><meta http-equiv="Content-Type" content="text/html charset=UTF-8" /><script src="https://unpkg.com/tailwindcss-jit-cdn"></script>
  <style>
  .tableClass {
	 border-collapse: collapse;
	 margin: 0;
	 overflow: hidden;
	 table-layout: fixed;
	 width: auto;
}
 .tableClass td, .tableClass th {
	 border: 1.5px solid #000;
	 box-sizing: border-box;
	 min-width: 1em;
	 width: 6em;
	 padding: 3px 5px;
	 position: relative;
	 vertical-align: top;
}
 .tableClass td > *, .tableClass th > * {
	 margin-bottom: 0;
}
 .tableClass th {
	 background-color: rgb(185,208,198);
	 font-weight: bold;
	 text-align: left;
}
 .tableClass .selectedCell:after {
	 background: rgba(200, 200, 255, 0.4);
	 content: "";
	 left: 0;
	 right: 0;
	 top: 0;
	 bottom: 0;
	 pointer-events: none;
	 position: absolute;
	 z-index: 2;
}
 .tableClass .column-resize-handle {
	 background-color: #adf;
	 bottom: -2px;
	 position: absolute;
	 right: -2px;
	 pointer-events: none;
	 top: 0;
	 width: 4px;
}
 .tableClass p {
	 margin: 0;
}
 .tableWrapper {
	 padding: 1rem 0;
	 overflow-x: auto;
}
 .resize-cursor {
	 cursor: ew-resize;
	 cursor: col-resize;
}
  </style>
  </head><body>`