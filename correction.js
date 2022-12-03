const fs = require('fs');
const events = require('events');

const eventsEmitter = new events.EventEmitter();

fs.readFile(`./input.txt`, 'utf-8', (err, data) => {
  if (err) {
    console.log(err);
    return err;
  } else {
    //console.log(data);
    fs.readFile(`./data/${data}.txt`, 'utf-8', (error, data1) => {
      if (error) {
        eventsEmitter.emit(
          'writing',
          `${data} does not exist, please try again with different value`
        );
      } else {
        eventsEmitter.emit('reading-input', data1);
      }
    });
  }
});

eventsEmitter.on('reading-input', (data) => {
  // console.log(`reading data and it content ${data}`);
  fs.writeFile(`./output.txt`, data, (err) => {
    if (err) {
      console.log(err);
    }
  });
});
eventsEmitter.on('writing', (data) => {
  // console.log(`Writing Error from ${data}`);
  fs.writeFile('./output.txt', data, (err) => {
    if (err) {
      return err;
    }
  });
});

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
