class TimeTracker {
  #startTime = null;
  #endTime = null;

  start() {
    if (!this.#startTime) {
      this.#startTime = new Date();
    }
    else {
      throw "Time tracker is already initiated.";
    }
  };

  end() {
    this.#endTime = new Date();
    let timeDiff = (this.#endTime - this.#startTime) / 1000;
    this.#startTime = null;
    this.#endTime = null;
    return timeDiff;
  }
}

module.exports = {
  TimeTracker
};