
const form = document.getElementById("access-form");

if(form)
{
    form.addEventListener("submit", async (e) => {

        e.preventDefault();

        const full_name = document.getElementById("name").value;
        const email = document.getElementById("email").value;
        const company = document.getElementById("company").value;
        const intended_use = document.getElementById("usecase").value;

        const { data, error } = await supabaseClient
            .from("access_requests")
            .insert([
                {
                    full_name,
                    email,
                    company,
                    intended_use
                }
            ]);

        if(error)
        {
            alert("Submission failed.");
            return;
        }

        alert("Institutional access request submitted.");

        form.reset();

    });
}
