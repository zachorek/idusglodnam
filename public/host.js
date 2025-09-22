const hostForm = document.getElementById("hostForm");
const hostMessage = document.getElementById("hostMessage");

hostForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value;
  const price = parseFloat(document.getElementById("price").value);
  const desc = document.getElementById("desc").value;

  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, price, desc })
    });

    const data = await res.json();
    hostMessage.innerHTML = `<p style="color:green">Produkt "${data.name}" został dodany!</p>`;
    hostForm.reset();
  } catch (err) {
    console.error(err);
    hostMessage.innerHTML = `<p style="color:red">Błąd dodawania produktu</p>`;
  }
});
