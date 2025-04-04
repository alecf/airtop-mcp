import { AirtopClient, AirtopError } from "@airtop/sdk";
import { Issue } from "@airtop/sdk/api/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function createMcpServer(apiKey: string, port: number) {
  const server = new McpServer(
    {
      version: "1.0.0",
      port,
      name: "airtop-mcp",
      description: `MCP server for Airtop integration`,
    },
    {
      instructions: `
    This server is used to create and manage browser sessions and windows using the Airtop API, 
    which is a browser automation tool that lets you control a browser from a remote server.

    You can create a session using the "createSession" tool, which gives you access to a single browser,
    returning JSON with a session ID.

    Once you have a session, you can create windows using the "createWindow" tool.
    This returns JSON with a window ID.

    You can query the content of a window using the "pageQuery" tool, passing in the session ID and window ID.
    This returns JSON with a content summary.

    You can also let the user interact with the window using the "getWindowInfo" tool,
    which returns a live view URL that you can share with the user, for them to interact with the window.

    Try to reuse the same session and windows for multiple queries to save on costs.`,
    },
  );

  // Initialize Airtop client
  const airtopClient = new AirtopClient({
    apiKey,
  });

  // Register tools
  server.tool(
    "createSession",
    "Create a new Airtop browser session",
    async () => {
      console.warn("createSession request");
      const session = await airtopClient.sessions.create();
      if (session.errors) {
        return reportAirtopErrors(session.errors);
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(session.data),
          },
        ],
      };
    },
  );
  server.tool(
    "createWindow",
    "Create a new browser window in the session",
    {
      sessionId: z.string(),
      url: z.string(),
    },
    async ({ sessionId, url }: { sessionId: string; url: string }) => {
      console.warn("createWindow request", sessionId, url);
      const window = await airtopClient.windows.create(sessionId, { url });
      if (window.errors?.length) {
        return reportAirtopErrors(window.errors);
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(window.data),
          },
        ],
      };
    },
  );

  server.tool(
    "pageQuery",
    "Query the current page content using AI",
    {
      sessionId: z.string().describe("The session ID"),
      windowId: z.string().describe("The window ID"),
      prompt: z.string().describe("The AI prompt to use"),
    },
    async ({
      sessionId,
      windowId,
      prompt,
    }: {
      sessionId: string;
      windowId: string;
      prompt: string;
    }) => {
      console.warn("pageQuery request", prompt);
      const contentSummary = await airtopClient.windows.pageQuery(
        sessionId,
        windowId,
        {
          prompt,
        },
      );
      console.warn("pageQuery response", contentSummary);
      if (contentSummary.errors) {
        return reportAirtopErrors(contentSummary.errors);
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(contentSummary.data),
          },
        ],
      };
    },
  );

  server.tool(
    "terminateSession",
    "Terminate an Airtop browser session",
    {
      sessionId: z.string().describe("The session ID"),
    },
    async ({ sessionId }: { sessionId: string }) => {
      await airtopClient.sessions.terminate(sessionId);
      return {
        content: [
          {
            type: "text",
            text: "Session terminated successfully",
          },
        ],
      };
    },
  );
  server.tool(
    "getWindowInfo",
    `Get information about a browser window, including a live view URL,
     which lets the user use and interact with the window. Use this to get a URL to share with the user,
     so they can log into a web site.`,
    {
      sessionId: z.string().describe("The session ID"),
      windowId: z.string().describe("The window ID"),
    },
    async ({
      sessionId,
      windowId,
    }: {
      sessionId: string;
      windowId: string;
    }) => {
      const window = await airtopClient.windows.getWindowInfo(
        sessionId,
        windowId,
      );
      if (window.errors?.length) {
        return reportAirtopErrors(window.errors);
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(window.data),
          },
        ],
      };
    },
  );
  // tool for airtopClient.windows.paginatedExtraction
  server.tool(
    "paginatedExtraction",
    "Extract data from a paginated list",
    {
      sessionId: z.string().describe("The session ID"),
      windowId: z.string().describe("The window ID"),
      prompt: z.string().describe("The AI prompt to use"),
      outputSchema: z.string().describe("JSONSchema for the output").optional(),
    },
    async ({
      sessionId,
      windowId,
      prompt,
      outputSchema,
    }: {
      sessionId: string;
      windowId: string;
      prompt: string;
      outputSchema?: string | undefined;
    }) => {
      const data = await airtopClient.windows.paginatedExtraction(
        sessionId,
        windowId,
        {
          prompt,
          configuration: {
            outputSchema,
          },
        },
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data),
          },
        ],
      };
    },
  );
  return server;
}
export function reportAirtopErrors(errors: AirtopError[] | Issue[]) {
  return {
    content: [
      {
        type: "text",
        text: `Errors from the API:\n${errors
          .map((e) => e.message ?? `Unknown error: ${JSON.stringify(e)}`)
          .join("\n")}`,
      } as const,
    ],
    isError: true,
  };
}
