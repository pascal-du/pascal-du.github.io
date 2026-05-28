(function () {
  const output = document.getElementById("rsa-output");
  const messageInput = document.getElementById("message");
  const runButton = document.getElementById("run-rsa");
  const keyModeInputs = Array.from(document.querySelectorAll('input[name="key-mode"]'));
  const manualKeyFields = document.getElementById("manual-key-fields");
  const manualPInput = document.getElementById("manual-p");
  const manualQInput = document.getElementById("manual-q");
  const manualEInput = document.getElementById("manual-e");

  function mathLine(expression) {
    return { type: "math", expression };
  }

  function formatTuple(values) {
    return `(${values.join(", ")})`;
  }

  function isPrime(n) {
    if (n < 2) return false;

    for (let i = 2; i <= Math.floor(Math.sqrt(n)); i += 1) {
      if (n % i === 0) return false;
    }

    return true;
  }

  function gcd(a, b) {
    let x = Math.abs(a);
    let y = Math.abs(b);

    while (y !== 0) {
      const remainder = x % y;
      x = y;
      y = remainder;
    }

    return x;
  }

  function extendedGcd(a, b) {
    if (b === 0) {
      return { gcd: a, x: 1, y: 0 };
    }

    const next = extendedGcd(b, a % b);
    return {
      gcd: next.gcd,
      x: next.y,
      y: next.x - Math.floor(a / b) * next.y,
    };
  }

  function modInverse(value, modulus) {
    const result = extendedGcd(value, modulus);

    if (result.gcd !== 1) {
      throw new Error(`${value} has no modular inverse modulo ${modulus}`);
    }

    return ((result.x % modulus) + modulus) % modulus;
  }

  function randomChoice(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function randomSampleTwo(items) {
    const firstIndex = Math.floor(Math.random() * items.length);
    let secondIndex = Math.floor(Math.random() * (items.length - 1));

    if (secondIndex >= firstIndex) {
      secondIndex += 1;
    }

    return [items[firstIndex], items[secondIndex]];
  }

  function rsaKeygenRandom(trace) {
    trace.push("KeyGen random");
    trace.push("=".repeat(50));

    const primes = [];
    for (let x = 3; x <= 100; x += 1) {
      if (isPrime(x)) primes.push(x);
    }

    trace.push(`Prime candidates in {3, ..., 100}: ${primes.join(", ")}`);

    const [p, q] = randomSampleTwo(primes);
    const n = p * q;
    const phiN = (p - 1) * (q - 1);

    trace.push(mathLine(`p = ${p}`));
    trace.push(mathLine(`q = ${q}`));
    trace.push(mathLine(`n = pq = ${p} \\cdot ${q} = ${n}`));
    trace.push(mathLine(`\\varphi(n) = (p - 1)(q - 1) = ${p - 1} \\cdot ${q - 1} = ${phiN}`));
    trace.push("");

    const validEs = [];
    for (let candidate = 2; candidate < phiN; candidate += 1) {
      if (gcd(candidate, phiN) === 1) {
        validEs.push(candidate);
      }
    }

    const e = randomChoice(validEs);
    const d = modInverse(e, phiN);

    trace.push("Choose e such that:");
    trace.push(mathLine(`1 < e < \\varphi(n)`));
    trace.push(mathLine(`\\gcd(e, \\varphi(n)) = 1`));
    trace.push(mathLine(`e = ${e}`));
    trace.push("");
    trace.push("Private exponent d is the modular inverse of e modulo phi(n)");
    trace.push(mathLine(`d \\equiv e^{-1} \\pmod{\\varphi(n)} = ${e}^{-1} \\bmod ${phiN} = ${d}`));
    trace.push("");
    trace.push(mathLine(`\\text{Public key} = (e, n) = ${formatTuple([e, n])}`));
    trace.push(mathLine(`\\text{Private key} = (d, n) = ${formatTuple([d, n])}`));

    return {
      publicKey: { e, n },
      privateKey: { d, n },
      p,
      q,
      phiN,
    };
  }

  function readInteger(input, name) {
    const value = Number.parseInt(input.value, 10);

    if (!Number.isInteger(value)) {
      throw new Error(`${name} must be an integer.`);
    }

    return value;
  }

  function rsaKeygenManual(trace) {
    trace.push("KeyGen manual");
    trace.push("=".repeat(50));

    const p = readInteger(manualPInput, "p");
    const q = readInteger(manualQInput, "q");
    const e = readInteger(manualEInput, "e");

    trace.push(`Input p = ${p}`);
    trace.push(`Input q = ${q}`);
    trace.push(`Input e = ${e}`);
    trace.push("");

    if (!isPrime(p)) {
      throw new Error("p must be prime.");
    }

    if (!isPrime(q)) {
      throw new Error("q must be prime.");
    }

    if (p === q) {
      throw new Error("p and q must be distinct primes.");
    }

    const n = p * q;
    const phiN = (p - 1) * (q - 1);

    trace.push(mathLine(`n = pq = ${p} \\cdot ${q} = ${n}`));
    trace.push(mathLine(`\\varphi(n) = (p - 1)(q - 1) = ${p - 1} \\cdot ${q - 1} = ${phiN}`));
    trace.push("");

    if (e <= 1 || e >= phiN) {
      throw new Error(`e must satisfy 1 < e < phi(n). For these primes, phi(n) = ${phiN}.`);
    }

    const commonDivisor = gcd(e, phiN);
    trace.push(mathLine(`\\gcd(e, \\varphi(n)) = \\gcd(${e}, ${phiN}) = ${commonDivisor}`));

    if (commonDivisor !== 1) {
      throw new Error("e must be coprime to phi(n).");
    }

    const d = modInverse(e, phiN);

    trace.push("");
    trace.push("Private exponent d is the modular inverse of e modulo phi(n)");
    trace.push(mathLine(`d \\equiv e^{-1} \\pmod{\\varphi(n)} = ${e}^{-1} \\bmod ${phiN} = ${d}`));
    trace.push("");
    trace.push(mathLine(`\\text{Public key} = (e, n) = ${formatTuple([e, n])}`));
    trace.push(mathLine(`\\text{Private key} = (d, n) = ${formatTuple([d, n])}`));

    return {
      publicKey: { e, n },
      privateKey: { d, n },
      p,
      q,
      phiN,
    };
  }

  function modularExponentiationTrace(base, exponent, modulus, trace) {
    trace.push(mathLine(`\\text{Computing } ${base}^{${exponent}} \\bmod ${modulus}`));
    trace.push("$".repeat(50));

    let reducedBase = base % modulus;
    trace.push(mathLine(`${base} \\bmod ${modulus} = ${reducedBase}`));

    let result = 1;
    let currentPower = reducedBase;
    let currentExponent = exponent;
    let step = 0;

    while (currentExponent > 0) {
      trace.push("");
      trace.push(`Step ${step}`);
      trace.push(mathLine(`\\text{current exponent} = ${currentExponent}`));
      trace.push(mathLine(`\\text{current power} = ${currentPower}`));
      trace.push(mathLine(`\\text{result} = ${result}`));

      if (currentExponent % 2 === 1) {
        trace.push(`${currentExponent} is odd, so multiply result by current_power`);
        trace.push(mathLine(`\\text{result} \\equiv ${result} \\cdot ${currentPower} \\pmod{${modulus}}`));
        result = (result * currentPower) % modulus;
        trace.push(mathLine(`\\text{result} = ${result}`));
      }

      const beforeSquare = currentPower;
      currentPower = (currentPower * currentPower) % modulus;
      trace.push(mathLine(`${beforeSquare}^{2} \\bmod ${modulus} = ${currentPower}`));

      currentExponent = Math.floor(currentExponent / 2);
      step += 1;
    }

    trace.push("");
    trace.push(mathLine(`\\text{Final result} = ${result}`));
    trace.push("=".repeat(50));
    trace.push("");

    return result;
  }

  function rsaEncrypt(message, publicKey, trace) {
    const { e, n } = publicKey;

    trace.push("Encryption");
    trace.push("=".repeat(50));
    trace.push(mathLine(`m = ${message}`));
    trace.push(mathLine(`(e, n) = ${formatTuple([e, n])}`));
    trace.push(mathLine(`c \\equiv m^{e} \\pmod{n}`));
    trace.push(mathLine(`c \\equiv ${message}^{${e}} \\pmod{${n}}`));
    trace.push("");

    const ciphertext = modularExponentiationTrace(message, e, n, trace);
    trace.push(mathLine(`c = ${ciphertext}`));

    return ciphertext;
  }

  function deriveM1(ciphertext, d, p, trace) {
    trace.push("Deriving m1");
    trace.push("=".repeat(50));

    const dp = d % (p - 1);

    trace.push(mathLine(`d = ${d}`));
    trace.push(mathLine(`p = ${p}`));
    trace.push(mathLine(`p - 1 = ${p - 1}`));
    trace.push("dp = d mod (p - 1)");
    trace.push(mathLine(`d_p \\equiv d \\pmod{p - 1}`));
    trace.push(mathLine(`d_p = ${d} \\bmod ${p - 1} = ${dp}`));
    trace.push("");
    trace.push("So:");
    trace.push(mathLine(`m_1 \\equiv c^{d_p} \\pmod{p}`));
    trace.push(mathLine(`m_1 \\equiv ${ciphertext}^{${dp}} \\pmod{${p}}`));
    trace.push("");

    const m1 = modularExponentiationTrace(ciphertext, dp, p, trace);

    trace.push(mathLine(`\\therefore\\ m_1 = ${m1}`));
    trace.push("");

    return { m1, dp };
  }

  function deriveM2(ciphertext, d, q, trace) {
    trace.push("Deriving m2");
    trace.push("=".repeat(50));

    const dq = d % (q - 1);

    trace.push(mathLine(`d = ${d}`));
    trace.push(mathLine(`q = ${q}`));
    trace.push(mathLine(`q - 1 = ${q - 1}`));
    trace.push("dq = d mod (q - 1)");
    trace.push(mathLine(`d_q \\equiv d \\pmod{q - 1}`));
    trace.push(mathLine(`d_q = ${d} \\bmod ${q - 1} = ${dq}`));
    trace.push("");
    trace.push("So:");
    trace.push(mathLine(`m_2 \\equiv c^{d_q} \\pmod{q}`));
    trace.push(mathLine(`m_2 \\equiv ${ciphertext}^{${dq}} \\pmod{${q}}`));
    trace.push("");

    const m2 = modularExponentiationTrace(ciphertext, dq, q, trace);

    trace.push(mathLine(`\\therefore\\ m_2 = ${m2}`));
    trace.push("");

    return { m2, dq };
  }

  function crtRecombine(m1, m2, p, q, trace) {
    trace.push("CRT recombination");
    trace.push("=".repeat(50));
    trace.push("We have:");
    trace.push(mathLine(`m \\equiv m_1 \\equiv ${m1} \\pmod{${p}}`));
    trace.push(mathLine(`m \\equiv m_2 \\equiv ${m2} \\pmod{${q}}`));
    trace.push("");

    const qInv = modInverse(q, p);

    trace.push(mathLine(`q_{inv} \\equiv q^{-1} \\pmod{p}`));
    trace.push(mathLine(`q_{inv} \\equiv ${q}^{-1} \\pmod{${p}} = ${qInv}`));
    trace.push("");

    const h = (qInv * (m1 - m2)) % p;
    const positiveH = (h + p) % p;

    trace.push(mathLine(`h \\equiv q_{inv}(m_1 - m_2) \\pmod{p}`));
    trace.push(mathLine(`h \\equiv ${qInv}(${m1} - ${m2}) \\pmod{${p}}`));
    trace.push(mathLine(`h = ${positiveH}`));
    trace.push("");

    const message = m2 + positiveH * q;

    trace.push(mathLine(`m = m_2 + hq`));
    trace.push(mathLine(`m = ${m2} + ${positiveH} \\cdot ${q} = ${message}`));
    trace.push("");

    return message;
  }

  function rsaDecryptCrt(ciphertext, d, p, q, trace) {
    trace.push("CRT decryption");
    trace.push("=".repeat(50));
    trace.push(mathLine(`c = ${ciphertext}`));
    trace.push(mathLine(`d = ${d}`));
    trace.push(mathLine(`p = ${p},\\ q = ${q}`));
    trace.push("Instead of computing c^d mod n directly, compute it modulo p and q, then recombine.");
    trace.push("");

    const { m1 } = deriveM1(ciphertext, d, p, trace);
    const { m2 } = deriveM2(ciphertext, d, q, trace);

    return crtRecombine(m1, m2, p, q, trace);
  }

  function renderTrace(trace) {
    output.replaceChildren();

    trace.forEach((entry) => {
      const line = document.createElement("div");

      if (typeof entry === "object" && entry.type === "math") {
        line.className = "math-line";
        line.textContent = `\\[${entry.expression}\\]`;
      } else {
        line.className = "trace-line";
        line.textContent = entry;
      }

      output.appendChild(line);
    });

    if (window.MathJax && typeof window.MathJax.typesetPromise === "function") {
      window.MathJax.typesetPromise([output]);
    }
  }

  function getKeyMode() {
    const selected = keyModeInputs.find((input) => input.checked);
    return selected ? selected.value : "random";
  }

  function updateModeUi() {
    const isManual = getKeyMode() === "manual";
    manualKeyFields.classList.toggle("is-visible", isManual);
    runButton.textContent = isManual ? "Run manual RSA" : "Generate RSA run";
  }

  function runDemo() {
    const keyTrace = [];
    const keys = getKeyMode() === "manual"
      ? rsaKeygenManual(keyTrace)
      : rsaKeygenRandom(keyTrace);
    const maxMessage = keys.publicKey.n - 1;
    const requestedMessage = Number.parseInt(messageInput.value, 10);
    const message = Number.isFinite(requestedMessage)
      ? Math.min(Math.max(requestedMessage, 0), maxMessage)
      : 50;

    messageInput.max = String(maxMessage);
    messageInput.value = String(message);

    const trace = [
      ...keyTrace,
      "",
      mathLine(`\\text{Selected plaintext message} = ${message}`),
      `RSA requires 0 <= message < n, so this run allows messages from 0 to ${maxMessage}.`,
      "",
    ];

    const ciphertext = rsaEncrypt(message, keys.publicKey, trace);
    trace.push("");

    const recoveredMessage = rsaDecryptCrt(ciphertext, keys.privateKey.d, keys.p, keys.q, trace);

    trace.push("Result");
    trace.push("=".repeat(50));
    trace.push(mathLine(`\\text{Original message} = ${message}`));
    trace.push(mathLine(`\\text{Recovered message} = ${recoveredMessage}`));
    trace.push(`Decryption ${message === recoveredMessage ? "succeeded" : "failed"}.`);

    renderTrace(trace);
  }

  function handleRunDemo() {
    try {
      runDemo();
    } catch (error) {
      renderTrace([
        "Input error",
        "=".repeat(50),
        error.message,
      ]);
    }
  }

  keyModeInputs.forEach((input) => {
    input.addEventListener("change", updateModeUi);
  });

  updateModeUi();
  runButton.addEventListener("click", handleRunDemo);
  handleRunDemo();
}());
