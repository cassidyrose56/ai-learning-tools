import "./AboutPage.css";

export default function AboutPage() {
  return (
    <section className="about-page">
      <section>
        <h2>Hi there, I'm Cassidy!</h2>
        <p>
          I'm a software engineer with a background in child development and
          education. I built this tool to help create leveled, interesting stories for the 
          kids in my life, and I hope that you can use it for the kids in yours!
        </p>
      </section>

      <section>
        <h2>Why I made this</h2>
        <p>
          Reading practice works best when the text matches two things at once:
          a child's reading level <em>and</em> something they actually want to
          read about. It can be hard for parents and teachers to find books that 
          line up with both. A book at the right level might be about a topic the kid finds boring; a book about
          their favorite thing might be three grade levels too hard.
        </p>
        <p>
          Kids have really unique interests sometimes, and I wanted to help parents 
          and teachers create reading material that is tailored to their passions. 
          For example, I had a childhood friend who was obsessed with World War I 
          in first grade - I can only imagine the hoops his parents had to jump through 
          to find a first grade level book that delved into the history of WWI. I thought 
          about him a lot when creating this app!
        </p>
        <p>
          I'm hoping this tool can help you create reading material that satisfies both 
          requirements for the children in your life. You pick the reading level and 
          topic, and you get a short story made specifically for that kid!
        </p>
      </section>

      <section>
        <h2>How the stories are generated and vetted</h2>
        <p>
          A writing AI drafts a short story based on the topic, reading level,
          and length you choose. Then a separate evaluator looks at the story
          and judges whether it actually sits at the requested reading level.
        </p>
        <p>
          If the evaluator confirms the level, the story shows up normally. If
          it cannot confirm, the story still shows up, but with a small
          note that says the reading level was not confirmed - you can review the story to see if it works for your child.
        </p>
        <p>
          The rubric the evaluator uses comes from{" "}
          <a
            href="https://learningcommons.org/for-developers/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learning Commons
          </a>
          , an open source project by CZI that publishes evaluators for education content.
          The grade-level rubric on that page is the same one this app uses.
        </p>
      </section>

      <section>
        <h2>Get in touch</h2>
        <p>
          If you have feedback, ideas, or want to tell me a story landed well
          (or badly) for your kid, I would love to hear it!
        </p>
        <ul>
          <li>
            Email:{" "}
            <a href="mailto:cassidyrose56@gmail.com">cassidyrose56@gmail.com</a>
          </li>
          <li>
            Source code:{" "}
            <a
              href="https://github.com/cassidyrose56/ai-learning-tools"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/cassidyrose56/ai-learning-tools
            </a>
          </li>
        </ul>
      </section>
    </section>
  );
}
