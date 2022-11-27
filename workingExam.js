const fs = require('fs');
const events = require('events');

const eventsEmitter = new events.EventEmitter();

eventsEmitter.on('reading', () => {
  fs.readFile('./input.txt', 'utf-8', (err, data) => {
    if (err) return err;

    fs.readFile(`./data/${data}.txt`, 'utf-8', (err, data1) => {
      //console.log(data1);
      if (err) {
        eventsEmitter.on('writing', () => {
          fs.writeFile('./output.txt', "le fichier n'existe pas", (err) => {
            if (err) return err;
          });
        });
        eventsEmitter.emit('writing');
        return err;
      }
      eventsEmitter.on('writing', () => {
        fs.writeFile('./output.txt', data1, (err) => {
          if (err) return err;
          console.log('le fihcier .....');
        });
      });
      eventsEmitter.emit('writing');
    });
  });
});

eventsEmitter.emit('reading');
// eventsEmitter.emit('reading');

// eventsEmitter.on('reading', (name, age) => {
//   console.log(`name is : ${name}, his age : ${age}`);
// });
// eventsEmitter.emit('reading', 'jhon', 28);

/*
const handelRead = () => {
  console.log('file has readed');
};

const handleWrite = () => {

};

eventsEmitter.on('reading', handelRead);
eventsEmitter.emit('reading');

eventsEmitter.on('writing', handleWrite);
eventsEmitter.emit('writing', handleWrite);
*/
/*
fs.readFile('./input.txt', 'utf-8', (err, data) => {
  if (err) return err;

  fs.readFile(`./data/${data}.txt`, 'utf-8', (err, data1) => {
    if (err) {
      fs.writeFile('./output.txt', "le fichier n'existe pas", (err) => {
        if (err) return err;
      });
      return err;
    }
    fs.writeFile('./output.txt', data1, (err) => {
      if (err) return err;
      console.log('le fihcier .....');
    });
  });
});

*/
