const fs = require('fs');
const events = require('events');

const eventsEmitter = new events.EventEmitter();

fs.readFile('./input.txt', 'utf-8', (err, data) => {
  if (err) return err;

  fs.readFile(`./data/${data}.txt`, 'utf-8', (err, data1) => {
    if (err) {
      fs.writeFile('./output.txt', `${data}.txt does not exist`, (err) => {
        if (err) return err;
      });
      return err;
    }
    fs.writeFile('./output.txt', data1, (err) => {
      if (err) return err;
      console.log('le fihcier has been written');
    });
  });
});
