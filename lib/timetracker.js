const { info } = require('./logger');

class TimeTracker {
  #functionName = null;
  #startTime = null;
  #endTime = null;

  start(functionName) {
    if (!this.#startTime) {
      this.#startTime = new Date();
      this.#functionName = functionName;
    }
    else {
      throw "Time tracker is already initiated.";
    }
  };

  end() {
    this.#endTime = new Date();
    let timeDiff = (this.#endTime - this.#startTime) / 1000;
    info("Total time elapsed for " + this.#functionName + ": " + timeDiff + " seconds");
    this.#startTime = null;
    this.#endTime = null;
    this.#functionName = null;
  }
}

module.exports = {
  TimeTracker
};