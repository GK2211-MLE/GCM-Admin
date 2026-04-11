import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { apiClient } from '@/lib/api-client';
import {
  FileEdit,
  Save,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  ChefHat,
  Clock,
  Users,
  X,
} from 'lucide-react';

// ─── CMS Pages types ───
interface CmsPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  isPublished: boolean;
  updatedAt: string;
}

const SLUG_LABELS: Record<string, string> = {
  about: 'About Us',
  contact: 'Contact Us',
  privacy: 'Privacy Policy',
  terms: 'Terms & Conditions',
};

// ─── Recipes types ───
interface Recipe {
  id: string;
  title: string;
  slug: string;
  category: string;
  imageUrl: string;
  description: string;
  ingredients: string;
  instructions: string;
  prepTime: string;
  cookTime: string;
  servings: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

const RECIPE_CATEGORIES = ['Chicken', 'Lamb', 'Goat', 'Beef', 'Seafood'];

const EMPTY_RECIPE: Omit<Recipe, 'id' | 'slug' | 'createdAt' | 'updatedAt'> = {
  title: '',
  category: 'Chicken',
  imageUrl: '',
  description: '',
  ingredients: '',
  instructions: '',
  prepTime: '',
  cookTime: '',
  servings: '',
  isPublished: true,
};

// ─── Main CMS Page ───
export function CMSPage() {
  const [activeTab, setActiveTab] = useState<'pages' | 'recipes'>('pages');

  return (
    <div>
      <PageHeader title="CMS" description="Manage website content" />

      {/* Tabs */}
      <div className="flex gap-1 mt-4 border-b">
        <button
          onClick={() => setActiveTab('pages')}
          className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
            activeTab === 'pages'
              ? 'bg-white border border-b-white -mb-px text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileEdit className="h-4 w-4 inline mr-2" />
          Pages
        </button>
        <button
          onClick={() => setActiveTab('recipes')}
          className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
            activeTab === 'recipes'
              ? 'bg-white border border-b-white -mb-px text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <ChefHat className="h-4 w-4 inline mr-2" />
          Recipes
        </button>
      </div>

      {activeTab === 'pages' ? <PagesSection /> : <RecipesSection />}
    </div>
  );
}

// ─── Pages Section (existing functionality) ───
function PagesSection() {
  const [pages, setPages] = useState<CmsPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<CmsPage | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editPublished, setEditPublished] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    loadPages();
  }, []);

  async function loadPages() {
    try {
      const { data } = await apiClient.get('/cms');
      setPages(data.pages);
      if (data.pages.length > 0 && !selectedPage) {
        selectPage(data.pages[0]);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }

  function selectPage(page: CmsPage) {
    setSelectedPage(page);
    setEditTitle(page.title);
    setEditContent(page.content);
    setEditPublished(page.isPublished);
    setSaveMessage('');
  }

  async function handleSave() {
    if (!selectedPage) return;
    setIsSaving(true);
    setSaveMessage('');
    try {
      const { data } = await apiClient.put(`/cms/${selectedPage.id}`, {
        title: editTitle,
        content: editContent,
        isPublished: editPublished,
      });
      setPages((prev) => prev.map((p) => (p.id === data.page.id ? data.page : p)));
      setSelectedPage(data.page);
      toast.success('Page saved');
    } catch {
      // Global axios interceptor already shows the error toast
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex gap-6 mt-6">
      {/* Sidebar - page list */}
      <div className="w-64 shrink-0">
        <div className="bg-white rounded-lg border shadow-sm">
          <div className="p-3 border-b">
            <h3 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">Pages</h3>
          </div>
          <div className="divide-y">
            {pages.map((page) => (
              <button
                key={page.id}
                onClick={() => selectPage(page)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                  selectedPage?.id === page.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileEdit className="h-4 w-4 text-gray-400" />
                  <span className="font-medium text-sm">{SLUG_LABELS[page.slug] || page.title}</span>
                </div>
                <div className="flex items-center gap-1 mt-1 ml-6">
                  {page.isPublished ? (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <Eye className="h-3 w-3" /> Published
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <EyeOff className="h-3 w-3" /> Draft
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1">
        {selectedPage ? (
          <div className="bg-white rounded-lg border shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">
                Edit: {SLUG_LABELS[selectedPage.slug] || selectedPage.title}
              </h2>
              <div className="flex items-center gap-3">
                {saveMessage && (
                  <span
                    className={`text-sm ${
                      saveMessage.includes('success') ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {saveMessage}
                  </span>
                )}
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Changes
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={16}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm leading-relaxed resize-y"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="published"
                  checked={editPublished}
                  onChange={(e) => setEditPublished(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="published" className="text-sm text-gray-700">
                  Published (visible to customers)
                </label>
              </div>
            </div>

            <div className="mt-4 text-xs text-gray-400">
              Slug: <code className="bg-gray-100 px-1 py-0.5 rounded">{selectedPage.slug}</code>
              {' | '}
              Last updated: {new Date(selectedPage.updatedAt).toLocaleString()}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg border shadow-sm p-12 text-center text-gray-400">
            Select a page from the sidebar to edit
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Recipes Section ───
function RecipesSection() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [form, setForm] = useState(EMPTY_RECIPE);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadRecipes();
  }, []);

  async function loadRecipes() {
    try {
      const { data } = await apiClient.get('/recipes');
      setRecipes(data.recipes ?? []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }

  function openCreate() {
    setEditingRecipe(null);
    setForm({ ...EMPTY_RECIPE });
    setShowEditor(true);
    setMessage('');
  }

  function openEdit(recipe: Recipe) {
    setEditingRecipe(recipe);
    setForm({
      title: recipe.title,
      category: recipe.category,
      imageUrl: recipe.imageUrl,
      description: recipe.description,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      prepTime: recipe.prepTime,
      cookTime: recipe.cookTime,
      servings: recipe.servings,
      isPublished: recipe.isPublished,
    });
    setShowEditor(true);
    setMessage('');
  }

  function closeEditor() {
    setShowEditor(false);
    setEditingRecipe(null);
    setMessage('');
  }

  async function handleSave() {
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    setIsSaving(true);
    setMessage('');
    try {
      if (editingRecipe) {
        const { data } = await apiClient.put(`/recipes/${editingRecipe.id}`, form);
        setRecipes((prev) =>
          prev.map((r) => (r.id === editingRecipe.id ? data.recipe : r))
        );
        toast.success('Recipe updated');
      } else {
        const { data } = await apiClient.post('/recipes', form);
        setRecipes((prev) => [data.recipe, ...prev]);
        toast.success('Recipe created');
      }
      closeEditor();
    } catch {
      // Global interceptor handles the error toast
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(recipe: Recipe) {
    if (!confirm(`Delete "${recipe.title}"? This cannot be undone.`)) return;
    try {
      await apiClient.delete(`/recipes/${recipe.id}`);
      setRecipes((prev) => prev.filter((r) => r.id !== recipe.id));
      toast.success('Recipe deleted');
    } catch {
      // Global interceptor handles the error toast
    }
  }

  function updateForm(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const categoryColor: Record<string, string> = {
    Chicken: 'bg-yellow-100 text-yellow-800',
    Lamb: 'bg-red-100 text-red-800',
    Goat: 'bg-orange-100 text-orange-800',
    Beef: 'bg-rose-100 text-rose-800',
    Seafood: 'bg-blue-100 text-blue-800',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // ─── Editor Modal ───
  if (showEditor) {
    return (
      <div className="mt-6">
        <div className="bg-white rounded-lg border shadow-sm p-6 max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">
              {editingRecipe ? 'Edit Recipe' : 'New Recipe'}
            </h2>
            <button onClick={closeEditor} className="p-1 hover:bg-gray-100 rounded">
              <X className="h-5 w-5 text-gray-400" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => updateForm('title', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Recipe title"
              />
            </div>

            {/* Category + Image URL */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => updateForm('category', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                >
                  {RECIPE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                <input
                  type="text"
                  value={form.imageUrl}
                  onChange={(e) => updateForm('imageUrl', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="https://..."
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => updateForm('description', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
                placeholder="Brief description of the recipe"
              />
            </div>

            {/* Ingredients */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ingredients{' '}
                <span className="text-gray-400 font-normal">(comma-separated)</span>
              </label>
              <textarea
                value={form.ingredients}
                onChange={(e) => updateForm('ingredients', e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
                placeholder="500g chicken breast, 2 onions, 3 cloves garlic, ..."
              />
            </div>

            {/* Instructions */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Instructions</label>
              <textarea
                value={form.instructions}
                onChange={(e) => updateForm('instructions', e.target.value)}
                rows={6}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
                placeholder="Step-by-step cooking instructions..."
              />
            </div>

            {/* Prep Time, Cook Time, Servings */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prep Time</label>
                <input
                  type="text"
                  value={form.prepTime}
                  onChange={(e) => updateForm('prepTime', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="15 mins"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cook Time</label>
                <input
                  type="text"
                  value={form.cookTime}
                  onChange={(e) => updateForm('cookTime', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="30 mins"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Servings</label>
                <input
                  type="text"
                  value={form.servings}
                  onChange={(e) => updateForm('servings', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="4"
                />
              </div>
            </div>

            {/* Published toggle */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="recipe-published"
                checked={form.isPublished}
                onChange={(e) => updateForm('isPublished', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="recipe-published" className="text-sm text-gray-700">
                Published (visible to customers)
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t">
            {message && (
              <span className="text-sm text-red-600">{message}</span>
            )}
            <div className="flex items-center gap-3 ml-auto">
              <button
                onClick={closeEditor}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {editingRecipe ? 'Update Recipe' : 'Create Recipe'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Recipe List ───
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {recipes.length} recipe{recipes.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Add Recipe
        </button>
      </div>

      {recipes.length === 0 ? (
        <div className="bg-white rounded-lg border shadow-sm p-12 text-center">
          <ChefHat className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No recipes yet. Create your first recipe!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {recipes.map((recipe) => (
            <div
              key={recipe.id}
              className="bg-white rounded-lg border shadow-sm overflow-hidden group hover:shadow-md transition-shadow"
            >
              {/* Image */}
              <div className="aspect-video bg-gray-100 relative overflow-hidden">
                {recipe.imageUrl ? (
                  <img
                    src={recipe.imageUrl}
                    alt={recipe.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ChefHat className="h-10 w-10 text-gray-300" />
                  </div>
                )}
                {/* Category badge */}
                <span
                  className={`absolute top-2 right-2 text-xs font-semibold px-2 py-1 rounded-md ${
                    categoryColor[recipe.category] || 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {recipe.category}
                </span>
                {/* Published status */}
                {!recipe.isPublished && (
                  <span className="absolute top-2 right-2 text-xs font-medium px-2 py-1 rounded-md bg-gray-800 text-white">
                    Draft
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <h3 className="font-semibold text-sm mb-2 line-clamp-1">{recipe.title}</h3>
                <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                  {recipe.prepTime && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {recipe.prepTime}
                    </span>
                  )}
                  {recipe.servings && (
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {recipe.servings} servings
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEdit(recipe)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(recipe)}
                    className="inline-flex items-center justify-center p-1.5 text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
